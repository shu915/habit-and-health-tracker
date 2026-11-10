import { CalorieBalanceChart } from "@/components/calorie-balance-chart";
import type { CalorieChartPoint } from "@/components/calorie-chart";
import { balanceSummary, MIN_DAYS_FOR_KG } from "@/lib/calorie-trend";
import { SPARSE_CONDITION } from "@/lib/sparse-day";

// 摂取 − 消費の目安のカード: 見出しに差の中央値(過ぎた日だけ。書きかけの日は、まだ増えるので数えない)、凡例、図、表の形の代替。
// 消費の目安は、日の詳細の「この日の結果」と同じ計算(基礎代謝 × その日の活動係数 + その日の運動)。推定どうしの差なので、目安であり、医療上の指示ではない
export function CalorieBalanceCard({ points, syncId, highlightDates }: { points: CalorieChartPoint[]; syncId: string; highlightDates?: readonly string[] }) {
  const withDiff = points.filter((p) => p.diffKcal !== null);
  const summary = balanceSummary(points);
  const sparseWithDiff = points.filter((p) => !p.inProgress && p.sparse === true && p.diffKcal !== null).length; // 差を計算できた過ぎた日のうち、データ不足の日
  const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;
  const signed = (value: number) => `${value > 0 ? "+" : ""}${kcal(value)}`;
  // 体重換算は 0.1kg 単位。±0.05kg 未満は「ほぼ 0kg」(−0.0 と出さない)
  const kgText = (kg: number) => (Math.abs(kg) < 0.05 ? "ほぼ 0kg" : `${kg > 0 ? "+" : "-"}${Math.abs(kg).toFixed(1)}kg`);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface-raised p-4 sm:p-5 print:gap-1.5 print:p-3 print:break-inside-avoid">
      <div>
        <h3 className="text-[15px] font-bold">摂取 − 消費の目安</h3>
        {withDiff.length > 0 ? (
          <>
            {summary === null ? (
              <p className="text-sm text-ink-muted">
                {sparseWithDiff > 0 ? `差を計算できた日は、すべて、データが不足している(${SPARSE_CONDITION})ため、合計は出せません(記録のもれかもしれません)。` : "過ぎた日の差がまだありません(今日の分は、終わってから数えます)。"}
              </p>
            ) : !summary.enough ? (
              <p className="text-sm text-ink-muted">
                データがそろった日が少ないため、差の合計・中央値・体重の換算は出しません(いま {summary.days} 日、{summary.neededDays} 日以上で出ます)。
              </p>
            ) : (
              <>
                <p>
                  <span className="text-2xl font-semibold">{signed(summary.sumKcal)}</span> <span className="text-sm text-ink-muted">{summary.kg === null ? `差の合計(体重への換算は、差を計算できた日が ${MIN_DAYS_FOR_KG} 日以上になってから)` : `差の合計(体重に換算して約 ${kgText(summary.kg)})`}</span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  過ぎた日だけ ・ {points.length} 日中 {summary.days} 日に差を計算 ・ 1 日の中央値 {signed(summary.medianKcal)}
                </p>
                {summary.excluded > 0 && (
                  <p className="text-xs text-ink-muted">
                    {summary.excluded} 日は、データが不足している({SPARSE_CONDITION})ため、除いています(薄い棒)。
                  </p>
                )}
                {/* 換算の根拠と、「体重計を信じる」注意を、1 つにまとめた(以前は 3 つの段落で、同じことを重ねていた) */}
                <p className="text-xs text-ink-muted">
                  脂肪 1kg = 約 7,200 kcal で換算した目安です。実際の体重は、水分や体質でも動くので、<strong className="font-medium text-ink">迷ったら、体重計の値を信じてください。</strong>
                </p>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-muted">この期間に、差を計算できる日がありません(食事の記録と、体重・身長・年齢・性別・活動係数が要ります)。</p>
        )}
      </div>

      {withDiff.length > 0 && (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              消費の目安より少ない(下)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--viz-over)", opacity: 0.85 }} />
              多い(上)
            </span>
          </p>
          <CalorieBalanceChart points={points} syncId={syncId} highlightDates={highlightDates} />
          <p className="text-xs text-ink-muted print:hidden">消費より少なく食べた日が下(青)、多く食べた日が上(オレンジ)で、推定どうしの差なので目安です。薄い棒は、まだ増える今日の分と、データが不足している日です(データ不足の日は、合計・中央値・体重の換算から除きます。もれた記録を、減量と誤解しないため)。</p>
          <details className="text-xs print:hidden">
            <summary className="cursor-pointer text-ink-muted">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">摂取</th>
                    <th className="py-1 text-right font-normal">消費の目安</th>
                    <th className="py-1 text-right font-normal">差</th>
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
