import { Suspense } from "react";
import { ProfileSummary } from "@/components/profile-summary";

// プロフィールの閲覧。編集は /profile/edit
export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <ProfileSummary />
    </Suspense>
  );
}
