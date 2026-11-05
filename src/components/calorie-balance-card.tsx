import { CalorieBalanceChart } from "@/components/calorie-balance-chart";
import type { CalorieChartPoint } from "@/components/calorie-chart";
import { balanceSummary, MIN_DAYS_FOR_KG } from "@/lib/calorie-trend";

// 摂取 − 消費の目安のカード: 見出しに差の中央値(過ぎた日だけ。書きかけの日は、まだ増えるので数えない)、凡例、図、表の形の代替。
// 消費の目安は、日の詳細の「この日の結果」と同じ計算(基礎代謝 × その日の活動係数 + その日の運動)。推定どうしの差なので、目安であり、医療上の指示ではない
export function CalorieBalanceCard({ points, syncId, highlightDates }: { points: CalorieChartPoint[]; syncId: string; highlightDates?: readonly string[] }) {
  const withDiff = points.filter((p) => p.diffKcal !== null);
  const summary = balanceSummary(points);
  const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;
  const signed = (value: number) => `${value > 0 ? "+" : ""}${kcal(value)}`;
  // 体重換算は 0.1kg 単位。±0.05kg 未満は「ほぼ 0kg」(−0.0 と出さない)
  const kgText = (kg: number) => (Math.abs(kg) < 0.05 ? "ほぼ 0kg" : `${kg > 0 ? "+" : "-"}${Math.abs(kg).toFixed(1)}kg`);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-base font-semibold">摂取 − 消費の目安</h3>
        {withDiff.length > 0 ? (
          <>
            {summary === null ? (
              <p className="text-sm text-zinc-500">過ぎた日の差がまだありません(今日の分は、終わってから数えます)。</p>
            ) : (
              <>
                <p>
                  <span className="text-2xl font-semibold">{signed(summary.sumKcal)}</span> <span className="text-sm text-zinc-500">{summary.kg === null ? `差の合計(体重への換算は、差を計算できた日が ${MIN_DAYS_FOR_KG} 日以上になってから)` : `差の合計(体重に換算して約 ${kgText(summary.kg)})`}</span>
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  過ぎた日だけ ・ {points.length} 日中 {summary.days} 日に差を計算 ・ 1 日の中央値 {signed(summary.medianKcal)}
                </p>
                <p className="text-xs text-zinc-500">差を計算できた日だけの合計です(食事の記録が無い日は入りません。記録が不完全な日も入ります)。脂肪 1kg = 約 7,200 kcal で換算した目安で、実際の体重は水分などでも動きます。</p>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">この期間に、差を計算できる日がありません(食事の記録と、体重・身長・年齢・性別・活動係数が要ります)。</p>
        )}
      </div>

      {withDiff.length > 0 && (
        <>
          <p className="flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              消費の目安より少ない(下)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-over)", opacity: 0.85 }} />
              多い(上)
            </span>
          </p>
          <CalorieBalanceChart points={points} syncId={syncId} highlightDates={highlightDates} />
          <p className="text-xs text-zinc-500">消費より少なく食べた日が下(青)、多く食べた日が上(オレンジ)で、推定どうしの差なので目安です。薄い棒は、まだ増える今日の分です。食事を一部しか記録しなかった日も、そのまま計算します(差が大きなマイナスに見え、合計も実際より減って見えます)。中央値は、そうした日に引きずられにくい数字です。</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">摂取</th>
                    <th className="py-1 text-right font-normal">消費の目安</th>
                    <th className="py-1 text-right font-normal">差</th>
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
                      <td className="py-1 text-right">{p.burnKcal === null ? "-" : kcal(p.burnKcal)}</td>
                      <td className="py-1 text-right">{p.diffKcal === null ? "-" : signed(p.diffKcal)}</td>
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
