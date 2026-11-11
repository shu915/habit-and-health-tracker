import { Suspense } from "react";
import { headers } from "next/headers";
import { BackLink } from "@/components/back-link";
import { AccountView } from "@/components/account-view";
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
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">アカウントの設定</h1>
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

  return <AccountView email={session?.user.email ?? ""} googleEnabled={googleEnabled} googleAccountId={googleAccountId} failure={failure} />;
}
