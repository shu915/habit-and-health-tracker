import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isEmailAllowed } from "@/lib/allowlist";
import { sendEmail } from "@/lib/email";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
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
            await sendEmail({ to: email, subject: "ログインリンク", text: `ログイン: ${url}` });
          } catch (err) {
            console.error("[email] failed to send magic link", err);
          }
        });
      },
    }),
    // Server Action からセッション Cookie を扱えるようにする。plugins の最後に置く
    nextCookies(),
  ],
});
