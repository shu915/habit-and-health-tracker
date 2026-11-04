import { Suspense } from "react";
import { ProfileForm, type ProfileFormInitial } from "@/components/profile-form";
import { getProfile } from "@/lib/profiles";
import { isProfileReady } from "@/lib/profile-ready";
import { PROFILE_FIELDS } from "@/lib/profile-schema";

// プロフィールの編集。保存は profile/actions.ts(成功すると / (ダッシュボード)へ移動する)
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">プロフィールの編集</h1>
      {!isProfileReady(profile) && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          記録を始める前に、目標カロリーと活動係数を決めてください。目標カロリーは「提案」ボタンで入力欄を埋められます。保存したら、もう一度日付を選んでください。
        </p>
      )}
      <ProfileForm initial={initial} />
    </div>
  );
}
