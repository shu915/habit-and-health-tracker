import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/current-user";

// ヘッダーに出す、ログイン中のメールアドレス(どのアカウントで入っているかが分かるように)。表示とメニューだけで、認可には使わない。
// - 広い画面(sm 以上): アドレスにマウスを乗せる(キーボードで合わせる)と、メニュー(アカウント・ログアウト)が出る。アドレスそのものを押すと、アカウントのページへ。長いアドレスは省略する
//   マウスが無い端末(タッチ)は、アドレスを押してアカウントのページへ行き、そこにもログアウトがある
// - 狭い画面(スマホ): アドレスは出さず、「アカウント」の文字にする(タイトルとログアウトで幅が埋まるため)。ログアウトは、ヘッダーに別に出る(layout.tsx)
// メニューの上の余白(pt-2)は、アドレスとメニューのあいだでマウスが外れて、メニューが消えないための橋
export async function UserEmail() {
  const session = await getSession();
  if (!session) return null;
  return (
    <div className="group relative">
      <Link href="/account" title={session.user.email} className="text-sm text-ink-muted hover:underline print:hidden">
        <span className="hidden max-w-60 truncate sm:inline-block sm:align-bottom">{session.user.email}</span>
        <span className="sm:hidden">アカウント</span>
      </Link>
      <div className="absolute top-full right-0 z-20 hidden pt-2 sm:group-focus-within:block sm:group-hover:block print:hidden">
        <div role="group" aria-label="アカウントのメニュー" className="flex min-w-40 flex-col gap-0.5 rounded-lg border border-line bg-surface-raised p-1 shadow-sm">
          <Link href="/account" className="rounded-md px-3 py-2 text-sm text-ink hover:bg-neutral focus-visible:bg-neutral">
            アカウント
          </Link>
          <SignOutButton variant="menu" />
        </div>
      </div>
    </div>
  );
}
