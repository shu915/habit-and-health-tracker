import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { createAuthOptions } from "@/lib/auth-options";
import { devLanAddresses } from "@/lib/dev-lan";
import { googleCredentialsFromEnv } from "@/lib/google-auth-options";
import { linkedAccountEmail } from "@/lib/linked-account-email";
import { describeEmailError, sendEmail } from "@/lib/email";
import { loginEmail } from "@/lib/login-email";
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

// 守りの配線は auth-options.ts(テストも同じ関数を使う)。ここでは、本物の DB・メール・環境変数をつなぐだけ
const options = createAuthOptions({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET が両方そろっているときだけ、Google が使える
  google: googleCredentialsFromEnv({ GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET }),
  // 連結したら、本人のメール(アカウントのアドレス。連結した Google のアドレスではない)へ知らせる。
  // Google から戻る応答を、メールの送信で遅らせないよう、待たずに送る(マジックリンクと同じ)。失敗しても、連結は成功のまま
  notifyLinked: async ({ to, provider }) => {
    after(async () => {
      try {
        await sendEmail({ to, ...linkedAccountEmail(provider, new Date()) });
      } catch (err) {
        console.error("[email] failed to send the linked-account notice:", describeEmailError(err));
      }
    });
  },
  // 待たない: 送信の成否や遅延で、登録済みか未登録かが分からないようにする
  deliverLoginLink: ({ to, url }) => {
    after(async () => {
      try {
        await sendEmail({ to, ...loginEmail(url) });
      } catch (err) {
        console.error("[email] failed to send magic link:", describeEmailError(err)); // err そのものは出さない(外から来るエラーに、キーなどが入りうるため)
      }
    });
  },
  isLoginLinkRequestLimited,
  // 失敗してもログインは止めない。getProfile() が行が無ければ作る
  onUserCreated: async (user) => {
    try {
      await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
    } catch (err) {
      console.error("[auth] failed to create the profile row:", err instanceof Error ? err.name : "unknown"); // err そのものは出さない(DB のエラーには、接続先やユーザー ID が入りうるため)
    }
  },
});

export const auth = betterAuth({
  baseURL,
  secret,
  ...options,
  // Server Action からセッション Cookie を扱えるようにする。plugins の最後に置く
  plugins: [...options.plugins, nextCookies()],
});
