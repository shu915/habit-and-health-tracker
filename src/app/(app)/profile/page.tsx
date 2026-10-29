import { Suspense } from "react";
import { ProfileForm, type ProfileFormInitial } from "@/components/profile-form";
import { ProfileSummary } from "@/components/profile-summary";
import { getProfile } from "@/lib/profiles";
import { PROFILE_FIELDS } from "@/lib/profile-schema";

// プロフィール。デフォルトは閲覧モードで、?mode=edit で編集フォームになる(/days/[date] と同じ形)
// searchParams は Suspense の内側で読む(cacheComponents で静的シェルを残すため)
export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <ProfileContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfileContent({ searchParams }: Pick<PageProps<"/profile">, "searchParams">) {
  const { mode } = await searchParams;
  if (mode !== "edit") return <ProfileSummary />;

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
