import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { isEmailAllowed } from "@/lib/allowlist";
import { googleAuthOptions, guardAccountEndpoints, type GoogleCredentials, type LinkedNotice } from "@/lib/google-auth-options";
import { MAGIC_LINK_EXPIRES_IN_SECONDS } from "@/lib/login-email";
import { sessionAllowlistHooks } from "@/lib/session-allowlist";

// Better Auth に渡す設定のうち、環境(DB・メール・環境変数)に依らない部分を、ここで組み立てる。
// 本番(auth.ts)と、テスト(auth-options.test.ts、google-auth.test.ts)が、**同じ関数**を使う。
// 守りの配線(許可リスト、回数制限、トークンのハッシュ、IP の取り方)を、テストが本物の設定で確かめられるようにするため
// (auth.ts に直接書くと、テストは同じ部品で組み立て直すだけになり、配線の行を消しても、どのテストも落ちなかった)。
// 差し替えるのは、外の世界につながる部分だけ(DB、メールの送信、メールアドレス単位の回数制限、プロフィールの作成)

export type AuthDeps = {
  database: BetterAuthOptions["database"];
  google: GoogleCredentials | null;
  // 連結が作られたあと、本人のメールへ知らせる
  notifyLinked: (notice: LinkedNotice) => Promise<void>;
  // ログインのメールを送る(許可リストの確認のあと、呼ばれる。待たずに送る実装にする)
  deliverLoginLink: (args: { to: string; url: string }) => void | Promise<void>;
  // ログインのメールの依頼を、メールアドレス単位で制限するか(true なら 429)
  isLoginLinkRequestLimited: (path: string, body: unknown) => Promise<boolean>;
  // ユーザーができたあとの処理(空のプロフィールを作る)。失敗してもログインは止めない
  onUserCreated: (user: { id: string }) => Promise<void>;
};

// IP 単位の回数制限が、リクエストの IP を読むヘッダー(先に書いたものを優先)。
// 指定が無いと、Better Auth は x-forwarded-for が 1 つの値のときだけ IP を採用し、複数の値(手前に Cloudflare などのプロキシがある)だと採用せず、
// 全員が 1 つの枠(no-trusted-ip)を共有してしまう。外から 1 分に数回叩くだけで、全員のログインが止まる。
// Vercel は x-vercel-forwarded-for に、接続元の IP だけを入れる(手前にプロキシがあっても、変わらない)。**デプロイ後に、実際に取れているかを確かめる**(docs/release-checklist.md)
export const IP_ADDRESS_HEADERS = ["x-vercel-forwarded-for", "x-forwarded-for"];

export function createAuthOptions(deps: AuthDeps) {
  // Google でのログインと、アカウントの連結の設定(方針は google-auth-options.ts)。認証情報が無ければ、Google は使えない
  const googleOptions = googleAuthOptions(deps.google, { notifyLinked: deps.notifyLinked });

  return {
    ...googleOptions,
    database: deps.database,
    // 回数の記録はメモリではなく DB に置く(サーバーレスではリクエストごとにプロセスが違い、メモリでは数えられない)。
    // 既定は本番だけ有効なので、開発でも効かせる。rateLimit テーブルが auth-schema.ts にある
    rateLimit: { enabled: true, storage: "database" as const },
    advanced: { ipAddress: { ipAddressHeaders: IP_ADDRESS_HEADERS } },
    hooks: {
      // ログインのメールの依頼を、メールアドレス単位でも制限する(IP 単位の制限は、IP を変えるとすり抜けられる)。
      // 許可リストの内外を問わず、同じ判定・同じ応答(429)にする(login-rate-limit.ts)
      before: createAuthMiddleware(async (ctx) => {
        if (await deps.isLoginLinkRequestLimited(ctx.path, ctx.body)) {
          throw APIError.from("TOO_MANY_REQUESTS", { message: "Too many requests. Please try again later.", code: "LOGIN_LINK_RATE_LIMITED" });
        }
        // 連結まわりの守り(Google のトークンを返すエンドポイントを閉じる、連結は最近ログインした人だけ)
        await guardAccountEndpoints(ctx);
      }),
    },
    databaseHooks: {
      ...googleOptions.databaseHooks, // 連結が作られたあとの、本人への知らせ
      // セッションを作るとき、許可リストの外の人には作らない(どの経路でも。許可リストから外した人が、連結済みの Google から入り直せないように)
      session: sessionAllowlistHooks,
      user: {
        create: {
          // ホワイトリストの外のアドレスでは、どの経路でもユーザーを作らない(false で作成を中止する)
          before: async (user: { email: string }) => isEmailAllowed(user.email),
          // ユーザーができたら、空のプロフィールも 1 つ自動で作る(作成機能は無く、本人は編集だけする)
          after: async (user: { id: string }) => deps.onUserCreated(user),
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
          // ホワイトリストの外には送らない。応答は送った場合と同じにして、登録の有無を教えない。アドレスはログに出さない
          if (!isEmailAllowed(email)) {
            console.warn("[auth] sign-in link not sent: address is not on the allowlist");
            return;
          }
          await deps.deliverLoginLink({ to: email, url });
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}
