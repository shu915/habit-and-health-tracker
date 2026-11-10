import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isEmailAllowed } from "@/lib/allowlist";
import { devLanAddresses } from "@/lib/dev-lan";
import { describeEmailError, sendEmail } from "@/lib/email";
import { loginEmail, MAGIC_LINK_EXPIRES_IN_SECONDS } from "@/lib/login-email";
import { isLoginLinkRequestLimited } from "@/lib/login-rate-limit";

// 本番は BETTER_AUTH_URL の 1 つに固定する。開発は、リクエストのホストから決める(Mac の localhost と、スマホから開く LAN のアドレスの両方で、ログインできるように)。
// 許可するのは、localhost と、このマシン自身の LAN のアドレスだけ(dev-lan.ts)。開発では BETTER_AUTH_URL は使わない
const baseURL =
  process.env.NODE_ENV === "production"
    ? process.env.BETTER_AUTH_URL
    : { allowedHosts: ["localhost:3000", ...devLanAddresses().map((address) => `${address}:3000`)], fallback: "http://localhost:3000", protocol: "http" as const };
if (!baseURL) throw new Error("BETTER_AUTH_URL is required in production");

// 未設定だと Better Auth は公開されている既知の値で署名してしまうので、どの環境でも必須にする
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is required (see .env.example)");

export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // 回数の記録はメモリではなく DB に置く(サーバーレスではリクエストごとにプロセスが違い、メモリでは数えられない)。
  // 既定は本番だけ有効なので、開発でも効かせる。rateLimit テーブルが auth-schema.ts にある
  rateLimit: { enabled: true, storage: "database" },
  hooks: {
    // ログインのメールの依頼を、メールアドレス単位でも制限する(IP 単位の制限は、IP を変えるとすり抜けられる)。
    // 許可リストの内外を問わず、同じ判定・同じ応答(429)にする(login-rate-limit.ts)
    before: createAuthMiddleware(async (ctx) => {
      if (await isLoginLinkRequestLimited(ctx.path, ctx.body)) {
        throw APIError.from("TOO_MANY_REQUESTS", { message: "Too many requests. Please try again later.", code: "LOGIN_LINK_RATE_LIMITED" });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // ホワイトリストの外のアドレスでは、どの経路でもユーザーを作らない(false で作成を中止する)
        before: async (user) => isEmailAllowed(user.email),
        // ユーザーができたら、空のプロフィールも1つ自動で作る(作成機能は無く、本人は編集だけする)。
        // 失敗してもログインは止めない。getProfile() が行が無ければ作る
        after: async (user) => {
          try {
            await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
          } catch (err) {
            console.error("[auth] failed to create the profile row", err);
          }
        },
      },
    },
  },
  plugins: [
    magicLink({
      // トークンは DB にハッシュで保存する(DB が漏れても、有効期限内のリンクを作れない)
      storeToken: "hashed",
      // 有効期限は、メールの本文に書く時間と同じ値(login-email.ts)
      expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
      sendMagicLink: async ({ email, url }) => {
        // ホワイトリストの外には送らない。応答は送った場合と同じにして、登録の有無を教えない。
        // アドレスはログに出さない
        if (!isEmailAllowed(email)) {
          console.warn("[auth] sign-in link not sent: address is not on the allowlist");
          return;
        }
        // 待たない: 送信の成否や遅延で、登録済みか未登録かが分からないようにする
        after(async () => {
          try {
            await sendEmail({ to: email, ...loginEmail(url) });
          } catch (err) {
            console.error("[email] failed to send magic link:", describeEmailError(err)); // err そのものは出さない(外から来るエラーに、キーなどが入りうるため)
          }
        });
      },
    }),
    // Server Action からセッション Cookie を扱えるようにする。plugins の最後に置く
    nextCookies(),
  ],
});
