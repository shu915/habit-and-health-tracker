import Link from "next/link";
import { EnergyCard } from "@/components/energy-card";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { activityLevelParts, genderLabel } from "@/lib/profile-options";
import { getProfile } from "@/lib/profiles";

// プロフィールの一覧(ダッシュボードと /profile で使う。見た目はとりあえず)。
// null は「未入力」(本人がまだ入力・算出していない)
type Row = { label: string; value: string | number | null; unit?: string; detail?: string | null };

export async function ProfileSummary() {
  const profile = await getProfile();

  const body: Row[] = [
    { label: "性別", value: genderLabel(profile.gender) },
    { label: "年齢", value: profile.age, unit: "歳" },
    { label: "身長", value: profile.heightCm, unit: "cm" },
    { label: "現在の体重", value: profile.currentWeightKg, unit: "kg" },
    { label: "体脂肪率", value: profile.currentBodyFatPercent, unit: "%" },
    { label: "ウエスト", value: profile.currentWaistCm, unit: "cm" },
  ];
  const goals: Row[] = [
    activityLevelRow(profile.activityLevel),
    { label: "目標体重", value: profile.targetWeightKg, unit: "kg" },
    { label: "目標カロリー", value: profile.targetCalories, unit: "kcal" },
    { label: "目標タンパク質", value: profile.targetProteinG, unit: "g" },
    { label: "睡眠時間の目標", value: formatDuration(profile.targetSleepMinutes) },
    { label: "睡眠の中間時刻", value: formatTimeOfDay(profile.targetSleepMidpoint) },
  ];

  return (
    <section className="flex flex-col gap-3">
      <EnergyCard profile={profile} />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">プロフィール</h2>
        <Link href="/profile?mode=edit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
          編集
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <RowList title="ボディデータ" rows={body} />
        <RowList title="目標値" rows={goals} />
      </div>
    </section>
  );
}

// 活動係数: 名前と掛ける数字を目立たせ、説明を小さく添える("軽い ×1.375" / "週1〜3回の軽い運動")
function activityLevelRow(value: string | null): Row {
  const parts = activityLevelParts(value);
  if (!parts) return { label: "活動係数", value: null };
  return {
    label: "活動係数",
    value: parts.name ? `${parts.name} ×${parts.multiplier}` : `×${parts.multiplier}`,
    detail: parts.detail ?? "選択肢にない値です(編集で選び直してください)",
  };
}

function RowList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-2 text-sm font-medium text-zinc-500">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((row) => (
          <Item key={row.label} row={row} />
        ))}
      </dl>
    </div>
  );
}

function Item({ row }: { row: Row }) {
  return (
    <>
      <dt className="text-zinc-500">{row.label}</dt>
      <dd>
        {row.value === null ? (
          <span className="text-zinc-400">未入力</span>
        ) : (
          <>
            {row.value}
            {row.unit ? ` ${row.unit}` : ""}
            {row.detail && <span className="block text-xs text-zinc-400">{row.detail}</span>}
          </>
        )}
      </dd>
    </>
  );
}
