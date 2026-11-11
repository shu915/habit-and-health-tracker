import { UserMenu } from "@/components/user-menu";
import { getSession } from "@/lib/current-user";

// ヘッダーに出す、ログイン中のアカウントのメニュー(メールアドレス・アカウントの設定・ログアウト)。表示とメニューだけで、認可には使わない。
// セッションを読むので、サーバーで、アドレスを取って、メニュー(user-menu.tsx。押して開く)へ渡す
export async function UserEmail() {
  const session = await getSession();
  if (!session) return null;
  return <UserMenu email={session.user.email} />;
}
