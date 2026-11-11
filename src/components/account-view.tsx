import { GoogleLinkControls } from "@/components/google-link-controls";
import { SignOutButton } from "@/components/sign-out-button";

// アカウントのページの表示(データは、ページ(app/(app)/account/page.tsx)が集めて渡す。認可は、そちらで先に行う)。2026-11-10、Claude Design の案。
// 見出しはカードの外(ほかのページと同じ)。ログイン方法は、状態のラベル(名前のすぐ横。文字つきで、色だけに頼らない)と、操作のボタン(右端に 1 つ)を、場所と形で分ける(混同を避けるため)。
// Google の細かい説明は、折りたたむ。ログアウトは、設定とは別に、区切り線の下に置く
type Props = {
  email: string;
  googleEnabled: boolean; // GOOGLE_CLIENT_ID・GOOGLE_CLIENT_SECRET がそろっているとき
  googleAccountId: string | null; // 連結済みなら、Better Auth の連結の id(解除に使う)
  failure: string | null; // 連結に失敗して戻されたときの理由
};

// ログイン方法の 1 行: 左に「名前 + 状態のラベル」と文、右端に操作のボタン 1 つ(狭い幅は、文の下に操作)。失敗の文は、グリッドの全幅で、行の下に出る(google-link-controls.tsx)
const ROW = "grid grid-cols-1 items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[minmax(14rem,1fr)_auto] sm:p-6";

// 状態のラベル。名前のすぐ横に置く、小さな丸いラベル(文字は小さめ。on = 使える・連結済みは緑でチェックつき、off = 未連結はベージュ)。
// 操作のボタン(右端の大きめの四角)と、形も位置も変えて、押せるものと見間違えないようにする(2026-11-10。状態の札とボタンが並んでいて、混同しやすかった)
function StatusTag({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${on ? "bg-status-on text-status-on-ink" : "bg-neutral text-ink-muted"}`}>
      {on && (
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      )}
      {children}
    </span>
  );
}

export function AccountView({ email, googleEnabled, googleAccountId, failure }: Props) {
  const linked = googleAccountId !== null;
  return (
    <>
      {failure && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}

      <section aria-labelledby="account-email" className="flex flex-col gap-3">
        <h2 id="account-email" className="text-xl font-bold">
          メールアドレス
        </h2>
        <div className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4 sm:p-6">
          <p className="text-lg font-semibold break-all">{email}</p>
          <p className="text-sm text-ink-muted">ログインのリンクは、このアドレスに届きます。</p>
        </div>
      </section>

      <section aria-labelledby="account-methods" className="flex flex-col gap-3">
        <h2 id="account-methods" className="text-xl font-bold">
          ログイン方法
        </h2>
        <ul className="flex flex-col divide-y divide-line-soft rounded-lg bg-surface-raised">
          <li className={ROW}>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-bold">メールのリンク</p>
                <StatusTag on>使えます</StatusTag>
              </div>
              <p className="text-sm text-ink-muted">いつでも使えます。</p>
            </div>
          </li>
          {googleEnabled && (
            <li className={ROW}>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-bold">Google</p>
                  <StatusTag on={linked}>{linked ? "連結済み" : "未連結"}</StatusTag>
                </div>
                {/* 状態は、札に出ているので、文は、使い道だけ。言葉のまとまりごとに、途中で切れない塊にする(折り返しは、塊のあいだだけ) */}
                <p className="text-sm text-ink-muted">
                  {!linked && <span className="whitespace-nowrap">連結すると、</span>}
                  <span className="whitespace-nowrap">メールを待たずに、</span>
                  <span className="whitespace-nowrap">Google でログインできます。</span>
                </p>
              </div>
              <GoogleLinkControls accountId={googleAccountId} />
            </li>
          )}
        </ul>
        {googleEnabled && (
          <details className="text-sm text-ink-muted">
            <summary className="cursor-pointer">Google の連結について</summary>
            <div className="mt-2 flex flex-col gap-1 text-xs leading-relaxed">
              <p>Google のメールアドレスは、このアカウントのメールアドレスと、違っていても構いません。</p>
              <p>連結と解除は、5 分以内にメールのリンクでログインした人だけができます(盗まれたログインで、勝手に連結されないため)。連結すると、このアドレスに、知らせのメールが届きます。</p>
              <p>Google だけでは、新しくアカウントを作れません。ログインできるのは、ここで連結した Google だけです。</p>
            </div>
          </details>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line pt-6">
        <p className="text-sm text-ink-muted">この端末からログアウトします。</p>
        <SignOutButton variant="page" />
      </div>
    </>
  );
}
