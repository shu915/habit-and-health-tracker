import { Suspense } from "react";
import { ProfileForm, type ProfileFormInitial } from "@/components/profile-form";
import { getProfile } from "@/lib/profiles";
import { PROFILE_FIELDS } from "@/lib/profile-schema";

// プロフィールの編集。保存は profile/actions.ts(成功すると /profile へ移動する)
export default function ProfileEditPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <ProfileEditContent />
    </Suspense>
  );
}

async function ProfileEditContent() {
  const profile = await getProfile();
  // DB の値(数値は文字列、null は空欄)を、フォームの初期値(文字列)にする。
  // Object.fromEntries は Record<string, string> を返すので、PROFILE_FIELDS の全キーがそろっていることを前提に型を付ける
  const initial = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, profile[field] === null ? "" : String(profile[field])]),
  ) as ProfileFormInitial;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">プロフィールの編集</h1>
      <ProfileForm initial={initial} />
    </div>
  );
}
