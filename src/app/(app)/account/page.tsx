import { Suspense } from "react";
import { headers } from "next/headers";
import { BackLink } from "@/components/back-link";
import { LinkGoogleButton } from "@/components/link-google-button";
import { SignOutButton } from "@/components/sign-out-button";
import { UnlinkGoogleButton } from "@/components/unlink-google-button";
import { auth } from "@/lib/auth";
import { getCurrentUserId, getSession } from "@/lib/current-user";
import { googleCredentialsFromEnv } from "@/lib/google-auth-options";
import { findLinkedAccountId, linkReturnErrorMessage } from "@/lib/linked-accounts";

// アカウント(ヘッダーのメールアドレスから)。ログイン方法を見て、Google を連結・解除する(方針は lib/google-auth-options.ts)。
// アカウントの土台は、メールのリンク。Google は、あとから足す 2 つ目のログイン方法で、Google だけでは、新しくアカウントを作れない
export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink href="/">ダッシュボードに戻る</BackLink>
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">アカウント</h1>
      </div>
      <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  await getCurrentUserId(); // 未ログインなら /login へ(データを扱う前に、必ず呼ぶ)
  const session = await getSession();
  const { error } = await searchParams;
  const googleEnabled = googleCredentialsFromEnv({ GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET }) !== null;
  const accounts = googleEnabled ? await auth.api.listUserAccounts({ headers: await headers() }) : [];
  const googleAccountId = findLinkedAccountId(accounts, "google");
  const failure = linkReturnErrorMessage(typeof error === "string" ? error : undefined);

  return (
    <>
      {failure && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}

      <section aria-label="メールアドレス" className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4 sm:p-5">
        <h2 className="text-xs font-bold text-ink-muted">メールアドレス</h2>
        <p className="text-[15px] break-all">{session?.user.email}</p>
        <p className="text-xs text-ink-muted">ログインのリンクは、このアドレスに届きます。</p>
      </section>

      <section aria-label="ログイン方法" className="flex flex-col gap-4 rounded-lg bg-surface-raised p-4 sm:p-5">
        <h2 className="text-xs font-bold text-ink-muted">ログイン方法</h2>
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold">メールのリンク</p>
          <p className="text-xs text-ink-muted">いつでも使えます。</p>
        </div>
        {googleEnabled && (
          <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
            <p className="text-[15px] font-semibold">Google</p>
            {googleAccountId !== null ? (
              <>
                <p className="text-xs text-ink-muted">連結済みです。メールのリンクを待たずに、Google でログインできます。</p>
                <UnlinkGoogleButton accountId={googleAccountId} />
              </>
            ) : (
              <>
                <p className="text-xs text-ink-muted">連結していません。連結すると、メールのリンクを待たずに、Google でログインできます。</p>
                <LinkGoogleButton />
              </>
            )}
          </div>
        )}
      </section>

      <section aria-label="ログアウト" className="flex flex-col items-start gap-2 rounded-lg bg-surface-raised p-4 sm:p-5">
        <h2 className="text-xs font-bold text-ink-muted">ログアウト</h2>
        <SignOutButton variant="page" />
      </section>

      {googleEnabled && (
        <div className="flex flex-col gap-1 text-xs leading-relaxed text-ink-muted">
          <p>Google のメールアドレスは、このアカウントのメールアドレスと、違っていても構いません。</p>
          <p>連結と解除は、5 分以内にメールのリンクでログインした人だけができます(盗まれたログインで、勝手に連結されないため)。連結すると、このアドレスに、知らせのメールが届きます。</p>
          <p>Google だけでは、新しくアカウントを作れません。ログインできるのは、ここで連結した Google だけです。</p>
        </div>
      )}
    </>
  );
}
