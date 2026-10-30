import { redirect } from "next/navigation";

// プロフィールの閲覧はダッシュボードにあるので、/profile はそこへ移す(編集は /profile/edit)
export default function ProfilePage() {
  redirect("/");
}
