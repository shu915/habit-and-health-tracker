import { TrendChart } from "@/components/trend-chart";
import { latestAverage, latestRecorded, MOVING_AVERAGE_DAYS, type TrendPoint } from "@/lib/trend";

// 体重・体脂肪率のカード(1 つの測定値。見出しに最新の記録と 7 日平均、図、表の形の代替)。syncId: 同じ値の図どうしは、ホバーが連動する
export function TrendCard({ title, unit, digits, points, syncId, highlightDates }: { title: string; unit: string; digits: number; points: TrendPoint[]; syncId: string; highlightDates?: readonly string[] }) {
  const format = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const latest = latestRecorded(points);
  const average = latestAverage(points);
  const recorded = points.filter((p) => p.value !== null).length;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface-raised p-4 sm:p-5 print:break-inside-avoid">
      <div>
        <h3 className="text-[15px] font-bold">{title}</h3>
        {latest ? (
          <p>
            <span className="text-2xl font-semibold">{format(latest.value ?? 0)}</span> <span className="text-sm text-ink-muted">{unit}</span>
            <span className="ml-2 text-xs text-ink-muted">{latest.date} の記録{average?.average != null && ` ・ 7 日平均 ${format(average.average)} ${unit}`}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">この期間の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && <TrendChart title={title} unit={unit} digits={digits} points={points} syncId={syncId} highlightDates={highlightDates} />}
      {recorded > 0 && <p className="text-xs text-ink-muted">点はその日の朝の記録、線は過去 {MOVING_AVERAGE_DAYS} 日の移動平均(記録が 2 日分以上あるとき)です。日々ぶれるので、傾向は線で見ます。</p>}

      {recorded > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-muted">表で見る</summary>
          <div className="mt-2 max-h-60 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-1 font-normal">日付</th>
                  <th className="py-1 text-right font-normal">その日</th>
                  <th className="py-1 text-right font-normal">7 日平均</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.date} className="border-t border-line-soft">
                    <td className="py-1">{p.date}</td>
                    <td className="py-1 text-right">{p.value === null ? "-" : `${format(p.value)} ${unit}`}</td>
                    <td className="py-1 text-right">{p.average === null ? "-" : `${format(p.average)} ${unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
