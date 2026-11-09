import Link from "next/link";
import { buttonClass } from "@/components/button";
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
    { label: "ウエスト", value: profile.currentWaistCm, unit: "cm", detail: profile.waistMeasuredOn ? `${profile.waistMeasuredOn} に測定` : null },
    // 活動係数は目標ではなく本人の状態
    activityLevelRow(profile.activityLevel),
  ];
  const goals: Row[] = [
    { label: "目標体重", value: profile.targetWeightKg, unit: "kg" },
    { label: "目標カロリー", value: profile.targetCalories, unit: "kcal" },
  ];
  const sleep: Row[] = [
    { label: "睡眠時間の目標", value: formatDuration(profile.targetSleepMinutes) },
    { label: "睡眠の中間時刻", value: formatTimeOfDay(profile.targetSleepMidpoint) },
  ];

  return (
    <section className="flex flex-col gap-3">
      <EnergyCard profile={profile} />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">プロフィール</h2>
        <Link href="/profile/edit" className={buttonClass()}>
          編集
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <RowList title="ボディデータ" rows={body} />
        <RowList title="目標値" rows={goals} moreRows={sleep} />
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

// moreRows は、同じ枠の中で、大きく間を空けて続ける項目(目標値の枠の睡眠など、別の意味のまとまり)
// 1 行に「ラベル(左)と値(右)」。値を右寄せにして桁を縦にそろえ、行の間に細い線を引く
function RowList({ title, rows, moreRows }: { title: string; rows: Row[]; moreRows?: Row[] }) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-raised px-4 pt-4 pb-2 sm:px-5 sm:pt-4.5">
      <h3 className="mb-1 text-xs font-bold text-ink-muted">{title}</h3>
      {/* 続きの項目(moreRows)があるときは、この枠の最後の行(目標カロリー)にも、下線を引く */}
      <dl className={`tabular-nums ${moreRows ? "border-b border-line-soft" : ""}`}>
        {rows.map((row) => (
          <Item key={row.label} row={row} />
        ))}
      </dl>
      {moreRows && (
        <dl className="mt-9 tabular-nums">
          {moreRows.map((row) => (
            <Item key={row.label} row={row} />
          ))}
        </dl>
      )}
    </div>
  );
}

// 値は少し大きく太く、単位は小さく薄く(数字が先に目に入るように)。補足(測定日・活動係数の説明)は値の下に右寄せ
function Item({ row }: { row: Row }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0">
      <dt className="shrink-0 text-sm text-ink-muted">{row.label}</dt>
      <dd className="min-w-0 text-right text-[15px] font-medium">
        {row.value === null ? (
          <span className="font-normal text-ink-subtle">未入力</span>
        ) : (
          <>
            {row.value}
            {row.unit && <span className="ml-1 text-xs font-normal text-ink-muted">{row.unit}</span>}
            {row.detail && <span className="mt-0.5 block text-xs font-normal text-ink-subtle">{row.detail}</span>}
          </>
        )}
      </dd>
    </div>
  );
}
