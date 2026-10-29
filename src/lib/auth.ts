import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
if (!baseURL) throw new Error("BETTER_AUTH_URL is required in production");

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
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
