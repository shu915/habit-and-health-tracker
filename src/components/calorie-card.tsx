import { CalorieChart, type CalorieChartPoint } from "@/components/calorie-chart";
import { intakeSummary } from "@/lib/calorie-trend";
import { SPARSE_CONDITION } from "@/lib/sparse-day";

// カロリーのカード: 見出しに摂取の中央値(過ぎた日だけ。書きかけの日は、まだ増えるので数えない)、凡例(棒と破線)、図、表の形の代替
export function CalorieCard({ points, syncId, highlightDates }: { points: CalorieChartPoint[]; syncId: string; highlightDates?: readonly string[] }) {
  const recorded = points.filter((p) => p.intake !== null).length;
  // データが不足している日(食事の記録が 1 回だけ、または摂取が目標の 6 割未満)は、中央値から外す。データがそろった日が足りないときは、中央値を出さない
  const { median: medianIntake, validDays, neededDays, enough, sparseDays } = intakeSummary(points);
  const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface-raised p-4 sm:p-5">
      <div>
        <h3 className="text-[15px] font-bold">摂取カロリー</h3>
        {recorded > 0 ? (
          <>
            {enough ? (
              <p>
                <span className="text-2xl font-semibold">{medianIntake === null ? "-" : kcal(Math.round(medianIntake))}</span> <span className="text-sm text-ink-muted">1 日の摂取の中央値</span>
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                データがそろった日が少ないため、1 日の摂取の中央値は出しません(いま {validDays} 日、{neededDays} 日以上で出ます)。
              </p>
            )}
            <p className="mt-1 text-xs text-ink-muted">
              過ぎた日だけ ・ {points.length} 日中 {recorded} 日に食事の記録
            </p>
            {sparseDays > 0 && (
              <p className="text-xs text-ink-muted">
                {sparseDays} 日は、データが不足している({SPARSE_CONDITION})ため、中央値から除いています(記録のもれかもしれません)。
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">この期間の食事の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              摂取(食事の合計)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--viz-text)" }} />
              目標となるカロリー
            </span>
          </p>
          <CalorieChart points={points} syncId={syncId} highlightDates={highlightDates} />
          <p className="text-xs text-ink-muted">棒は食事の合計、破線は目標となるカロリー(目標カロリー + その日の運動)です。食事の記録が無い日は棒を出しません。薄い棒は、まだ増える今日の分と、データが不足している日です。</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-muted">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">摂取</th>
                    <th className="py-1 text-right font-normal">目標となるカロリー</th>
                    <th className="py-1 text-right font-normal">うち運動</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-line-soft">
                      <td className="py-1">
                        {p.date}
                        {p.inProgress && <span className="text-ink-muted">(途中)</span>}
                        {p.sparse === true && <span className="text-ink-muted">(データ不足)</span>}
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
