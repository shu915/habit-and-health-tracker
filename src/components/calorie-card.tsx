import { CalorieChart, type CalorieChartPoint } from "@/components/calorie-chart";
import { median } from "@/lib/trend";

// カロリーのカード: 見出しに摂取の中央値(過ぎた日だけ。書きかけの日は、まだ増えるので数えない)、凡例(棒と破線)、図、表の形の代替
export function CalorieCard({ points, syncId, highlightDates }: { points: CalorieChartPoint[]; syncId: string; highlightDates?: readonly string[] }) {
  const recorded = points.filter((p) => p.intake !== null).length;
  const medianIntake = median(points.flatMap((p) => (p.intake === null || p.inProgress ? [] : [p.intake])));
  const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-base font-semibold">摂取カロリー</h3>
        {recorded > 0 ? (
          <>
            <p>
              <span className="text-2xl font-semibold">{medianIntake === null ? "-" : kcal(Math.round(medianIntake))}</span> <span className="text-sm text-zinc-500">1 日の摂取の中央値</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              過ぎた日だけ ・ {points.length} 日中 {recorded} 日に食事の記録
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">この期間の食事の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && (
        <>
          <p className="flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              摂取(食事の合計)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--viz-text)" }} />
              目標となるカロリー
            </span>
          </p>
          <CalorieChart points={points} syncId={syncId} highlightDates={highlightDates} />
          <p className="text-xs text-zinc-500">棒は食事の合計、破線は目標となるカロリー(目標カロリー + その日の運動)です。食事の記録が無い日は棒を出しません。薄い棒は、まだ増える今日の分です。</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">摂取</th>
                    <th className="py-1 text-right font-normal">目標となるカロリー</th>
                    <th className="py-1 text-right font-normal">うち運動</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="py-1">
                        {p.date}
                        {p.inProgress && <span className="text-zinc-500">(途中)</span>}
                      </td>
                      <td className="py-1 text-right">{p.intake === null ? "-" : kcal(p.intake)}</td>
                      <td className="py-1 text-right">{p.target === null ? "-" : kcal(p.target)}</td>
                      <td className="py-1 text-right">{p.exerciseKcal > 0 ? kcal(p.exerciseKcal) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
