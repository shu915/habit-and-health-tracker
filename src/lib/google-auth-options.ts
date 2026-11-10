import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

// Google でのログイン(と、アカウントの連結)の方針。Better Auth の設定のうち、Google に関わる部分だけを、auth.ts から分けて持つ(テストが、同じ設定で、別の DB の Better Auth を作れるように)。
// 方針(2026-11-10、利用者の設計): アカウントの土台は、マジックリンク(メール)。Google は、ログイン済みの本人が、アカウントのページで、あとから足す、2 つ目のログイン方法。
//   - Google だけでは、ユーザーを作れない(許可リストを迂回させない)
//   - メールが一致しても、勝手に連結しない(連結は、ログイン中に、自分で行う)
//   - Google のメールが、アカウントのメールと違ってもよい(Yahoo メールのアカウントに、Gmail の Google、など。GitHub や LINE を足すときも、同じ形)。ログイン中の本人だけが連結できるので、安全
//   - 連結を全部解除しても、マジックリンクで入れる
//   - 連結・解除は、最近ログインした人だけ(盗まれたセッションで、攻撃者が自分の Google を連結して居座るのを防ぐ)
//   - 連結したら、本人のメールに知らせる(身に覚えのない連結に、気づけるように)

// 連結・解除に要る、ログインからの新しさ。Better Auth の既定は 1 日だが、盗まれたセッションの悪用を防ぐために、短くする。
// これは、セッションの freshAge なので、新しいログインを求める、ほかの操作(メールの変更など)にも、同じ時間が効く
export const FRESH_SESSION_SECONDS = 5 * 60;

export type GoogleCredentials = { clientId: string; clientSecret: string };

// 環境変数から Google の認証情報を読む。両方そろっていなければ null(Google は使えない。ログイン画面とアカウントのページは、Google の部分を出さない)
export function googleCredentialsFromEnv(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): GoogleCredentials | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export type LinkedNotice = { to: string; provider: string };

type AuthMiddlewareContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

// Better Auth が、HTTP でも出している、Google のトークンを返すエンドポイント。保存した Google のトークンを、セッションの Cookie だけで取り出せてしまう。
// このアプリは、Google のトークンを使わない(ログインの確認だけ)ので、HTTP では閉じる
// (/account-info も、保存したトークンで Google に問い合わせるエンドポイント。このアプリは使わないので、あわせて閉じる)
const CLOSED_PATHS = new Set(["/get-access-token", "/refresh-token", "/account-info"]);

// auth.ts の hooks.before から呼ぶ。連結まわりのエンドポイントの守り:
//   - Google のトークンを返すエンドポイントは、閉じる
//   - 連結を始める(/link-social)のは、最近ログインした人だけ(Better Auth は、解除には新しさを求めるが、連結には求めない)。
//     新しさを確かめるのは、始めるときの 1 回。Google の画面から戻るコールバックは、始めたときの state(10 分、oauth_state の Cookie と結び付く)で完了する。
//     つまり、始めたあと、10 分以内にログアウトしても、連結は完了する(別のブラウザが、他人の連結を完了させることは、できない)
export async function guardAccountEndpoints(ctx: AuthMiddlewareContext): Promise<void> {
  if (CLOSED_PATHS.has(ctx.path)) {
    throw APIError.from("FORBIDDEN", { message: "This action is not available", code: "NOT_AVAILABLE" });
  }
  if (ctx.path !== "/link-social") return;
  const session = await getSessionFromCtx(ctx);
  if (!session?.session) return; // ログインしていない場合は、本来のエラー(401)に任せる
  const freshAge = ctx.context.sessionConfig.freshAge;
  if (freshAge === 0) return;
  const age = Date.now() - new Date(session.session.createdAt).getTime();
  if (age >= freshAge * 1000) {
    throw APIError.from("FORBIDDEN", { message: "Session is not fresh", code: "SESSION_NOT_FRESH" });
  }
}

// Better Auth に渡す設定。notifyLinked は、連結が作られたあとに、本人のメールへ知らせる処理(失敗しても、連結そのものは失敗にしない)
export function googleAuthOptions(google: GoogleCredentials | null, { notifyLinked }: { notifyLinked: (notice: LinkedNotice) => Promise<void> }) {
  return {
    // Google は、ユーザーを作れない
    ...(google && { socialProviders: { google: { ...google, disableSignUp: true } } }),
    account: {
      // Google のトークンは、このアプリでは使わない(ログインの確認だけ)が、Better Auth は account 表に保存する。DB が漏れたときのために、暗号化して保存する
      encryptOAuthTokens: true,
      accountLinking: {
        // Google のログインは、メールが一致しても、勝手には連結しない。連結は、ログイン中に linkSocial() で、自分で行う
        disableImplicitLinking: true,
        // Google のメールが、アカウントのメールと違ってもよい。連結はログイン中のセッションが要るので安全
        // (セッション無しで連結できる経路が、もしあれば、乗っ取りになる。そうならないよう、auth.ts の守りとテストで確かめている)。
        // **注意: trustedProviders には、メールを確認しないプロバイダー(LINE など)を入れない**。Better Auth は、trustedProviders に無く、メールが未確認のプロバイダーの連結を断る。
        // 入れると、確認していないメールを持つ相手が、連結できてしまう。プロバイダーを足すときは、このテストの方針(google-auth.test.ts)を、そのプロバイダーにも広げる
        allowDifferentEmails: true,
        // マジックリンクは、連結なしでも使える。Google が最後の 1 つでも、解除して、ログインできなくなることはない。
        // これが無いと、Better Auth は、最後の 1 つの連結の解除を断る
        allowUnlinkingAll: true,
      },
    },
    session: { freshAge: FRESH_SESSION_SECONDS },
    databaseHooks: {
      account: {
        create: {
          after: async (account, context) => {
            // 知らせの失敗で、連結そのものが失敗に見えないようにする
            try {
              const user = await context?.context.internalAdapter.findUserById(account.userId);
              if (user) await notifyLinked({ to: user.email, provider: account.providerId });
            } catch (err) {
              console.error("[auth] failed to notify about a linked account", err instanceof Error ? err.name : "unknown");
            }
          },
        },
      },
    },
  } satisfies Partial<BetterAuthOptions>;
}
