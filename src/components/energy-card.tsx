import Link from "next/link";
import { energyOverview, type ProfileEnergyInput } from "@/lib/energy-overview";

// ダッシュボードの一番上に出す、1 日の消費カロリーの目安(基礎代謝 × 活動係数)。
// 目標カロリーの根拠になる数字なので、大きく見せる。保存はせず、プロフィールからその場で計算する
const number = (value: number) => value.toLocaleString("ja-JP");
const disclaimer = <p className="mt-1 text-xs text-zinc-400">一般的な式による目安で、医療上の指示ではありません。</p>;

export function EnergyCard({ profile }: { profile: ProfileEnergyInput }) {
  const overview = energyOverview(profile);
  const card = "flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
  const editLink = (
    <Link href="/profile/edit" className="underline">
      プロフィールを編集
    </Link>
  );

  if (overview.kind === "missing") {
    return (
      <section className={card}>
        <h2 className="text-sm font-medium text-zinc-500">1日の消費カロリーの目安</h2>
        <p className="text-sm text-zinc-500">
          計算するには、{overview.missing.join("・")}の入力が必要です。{editLink}
        </p>
      </section>
    );
  }

  const method = overview.method === "katch-mcardle" ? "体脂肪率から計算" : "身長・体重・年齢・性別から計算";

  if (overview.kind === "needs-activity") {
    return (
      <section className={card}>
        <h2 className="text-sm font-medium text-zinc-500">1日の消費カロリーの目安</h2>
        <p className="text-sm text-zinc-500">
          基礎代謝は約 {number(overview.bmrKcal)} kcal です（{method}）。活動係数を選ぶと、1日の消費カロリーの目安が出ます。
          {editLink}
        </p>
        {disclaimer}
      </section>
    );
  }

  const { targetCalories, targetDiffKcal } = overview;
  return (
    <section className={card}>
      <h2 className="text-sm font-medium text-zinc-500">1日の消費カロリーの目安</h2>
      <p className="text-3xl font-semibold tabular-nums">
        約 {number(overview.tdeeKcal)}
        <span className="ml-1 text-base font-normal text-zinc-500">kcal</span>
      </p>
      <p className="text-xs text-zinc-500">
        基礎代謝 {number(overview.bmrKcal)} kcal × 活動係数 {overview.activityLevel}
        {overview.activityName ? `（${overview.activityName}）` : ""}。{method}
      </p>
      {targetCalories !== null && targetDiffKcal !== null && (
        <p className="mt-1 text-sm">
          目標カロリー <span className="font-medium tabular-nums">{number(targetCalories)} kcal</span>
          <span className="text-zinc-500">（{diffText(targetDiffKcal)}）</span>
        </p>
      )}
      {disclaimer}
    </section>
  );
}

function diffText(diff: number): string {
  if (diff === 0) return "消費と同じ";
  return diff < 0 ? `消費より 1日 ${number(-diff)} kcal 少ない` : `消費より 1日 ${number(diff)} kcal 多い`;
}
