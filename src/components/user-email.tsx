import { getSession } from "@/lib/current-user";

// ヘッダーに出す、ログイン中のメールアドレス(どのアカウントで入っているかが分かるように)。表示だけで、認可には使わない。
// 狭い画面(スマホ)では、タイトルとログアウトで幅が埋まるので出さない。長いアドレスは省略する
export async function UserEmail() {
  const session = await getSession();
  if (!session) return null;
  return (
    <span title={session.user.email} className="hidden max-w-60 truncate text-sm text-zinc-500 sm:inline">
      {session.user.email}
    </span>
  );
}
