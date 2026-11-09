import { WeeklyBandChart, WeeklyBarChart } from "@/components/weekly-chart";
import { countRows, formatterOf, intakeRows, tickFormatterOf, weeklyAxis, withUnit, type FormatSpec, type TickSpec } from "@/lib/weekly-chart-data";
import type { WeekCount, WeekPoint } from "@/lib/weekly-points";

// 長期レポート(四半期・年)の、週ごとのグラフのカード(見出し、図、注記、表の形の代替)。1 本 = 1 週間(月曜始まり)。
// 見出しの数字は、いちばん新しい週の中央値と、期間の最初の週と最後の週の差(値のある週だけ)

const latest = (points: readonly WeekPoint[]) => [...points].reverse().find((p) => p.median !== null) ?? null;
const first = (points: readonly WeekPoint[]) => points.find((p) => p.median !== null) ?? null;
const recordedWeeks = (points: readonly WeekPoint[]) => points.filter((p) => p.median !== null).length;

function Card({ title, headline, children }: { title: string; headline: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface-raised p-4 sm:p-5">
      <div>
        <h3 className="text-[15px] font-bold">{title}</h3>
        {headline}
      </div>
      {children}
    </div>
  );
}

function BandTable({ points, format }: { points: readonly WeekPoint[]; format: (value: number) => string }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-ink-muted">表で見る</summary>
      <div className="mt-2 max-h-60 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 font-normal">週(月曜)</th>
              <th className="py-1 text-right font-normal">中央値</th>
              <th className="py-1 text-right font-normal">最小〜最大</th>
              <th className="py-1 text-right font-normal">記録</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.weekStart} className="border-t border-line-soft">
                <td className="py-1">{p.weekStart}</td>
                <td className="py-1 text-right">{p.median === null ? "-" : format(p.median)}</td>
                <td className="py-1 text-right">{p.low === null || p.high === null ? "-" : `${format(p.low)} 〜 ${format(p.high)}`}</td>
                <td className="py-1 text-right">{p.recorded} 日</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// 線 + 帯のカード(睡眠・体重・体脂肪率)。step: 縦軸の目盛りの刻み。tickFormat: 縦軸の表示
export function WeeklyBandCard({ title, unit, points, step, format: formatSpec, tick }: { title: string; unit: string; points: readonly WeekPoint[]; step: number; format: FormatSpec; tick: TickSpec }) {
  const format = formatterOf(formatSpec);
  const last = latest(points);
  const start = first(points);
  const values = points.flatMap((p) => [p.low, p.high]).filter((v): v is number => v !== null);
  const axis = weeklyAxis(values, step);
  const weeks = recordedWeeks(points);
  return (
    <Card
      title={title}
      headline={
        last ? (
          <p>
            <span className="text-2xl font-semibold">{format(last.median ?? 0)}</span> <span className="text-sm text-ink-muted">{unit}</span>
            <span className="ml-2 text-xs text-ink-muted">
              {last.label} からの週の中央値{start && start.weekStart !== last.weekStart && ` ・ 最初の週は ${format(start.median ?? 0)}`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">この期間の記録がありません。</p>
        )
      }
    >
      {weeks > 0 && <WeeklyBandChart points={points} ariaLabel={`${title}の週ごとの推移。記録のある週は ${weeks} 週。${last ? `最新の週の中央値は ${withUnit(format, unit)(last.median ?? 0)}。` : ""}`} axis={axis} tick={tick} format={formatSpec} unit={unit} />}
      {weeks > 0 && <p className="text-xs text-ink-muted">1 本が 1 週間(月曜始まり)です。線は、その週の中央値、薄い帯は、その週の最小から最大です。記録が少ない週は、点を出しません。</p>}
      {weeks > 0 && <BandTable points={points} format={withUnit(format, unit)} />}
    </Card>
  );
}

export const SleepWeeklyCard = ({ points }: { points: readonly WeekPoint[] }) => (
  <WeeklyBandCard title="睡眠時間" unit="" points={points} step={60} format={{ kind: "hoursMinutes" }} tick="hours" />
);

// 摂取カロリー(週ごとの中央値の棒)と、目標となるカロリー(破線)。データがそろった日だけ
export function IntakeWeeklyCard({ intake, target }: { intake: readonly WeekPoint[]; target: readonly WeekPoint[] }) {
  const rows = intakeRows(intake, target);
  const weeks = recordedWeeks(intake);
  const values = rows.flatMap((r) => [r.value, r.target]).filter((v): v is number => v !== null);
  const axis = weeklyAxis(values, 500, { floor0: true });
  const last = latest(intake);
  const kcal = formatterOf({ kind: "kcal" });
  return (
    <Card
      title="摂取カロリー"
      headline={
        last ? (
          <p>
            <span className="text-2xl font-semibold">{Math.round(last.median ?? 0).toLocaleString("ja-JP")}</span> <span className="text-sm text-ink-muted">kcal</span>
            <span className="ml-2 text-xs text-ink-muted">{last.label} からの週の、1 日の摂取の中央値</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">この期間に、食事の記録がそろった週がありません。</p>
        )
      }
    >
      {weeks > 0 && <WeeklyBarChart rows={rows} ariaLabel={`摂取カロリーと目標となるカロリーの週ごとの推移。記録がそろった週は ${weeks} 週。`} axis={axis} tick="thousands" format={{ kind: "kcal" }} valueName="1 日の摂取の中央値" targetName="目標となるカロリー" />}
      {weeks > 0 && <p className="text-xs text-ink-muted">棒は、その週の、1 日の摂取の中央値、破線は目標となるカロリー(目標カロリー + 運動)です。データが不足している日と、書きかけの日は、除いています。</p>}
      {weeks > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-muted">表で見る</summary>
          <div className="mt-2 max-h-60 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-1 font-normal">週(月曜)</th>
                  <th className="py-1 text-right font-normal">摂取(中央値)</th>
                  <th className="py-1 text-right font-normal">目標</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.weekStart} className="border-t border-line-soft">
                    <td className="py-1">{r.weekStart}</td>
                    <td className="py-1 text-right">{r.value === null ? "-" : kcal(r.value)}</td>
                    <td className="py-1 text-right">{r.target === null ? "-" : kcal(r.target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

// 運動した日数(週ごとの棒。0 から 7)。運動は「いつもより多く動いた分」だけの記録なので、0 日の週は、ふだんどおりの週
export function ExerciseWeeklyCard({ weeks }: { weeks: readonly WeekCount[] }) {
  const rows = countRows(weeks);
  const total = weeks.reduce((n, w) => n + w.days, 0);
  const active = weeks.filter((w) => w.days > 0).length;
  return (
    <Card
      title="運動した日数"
      headline={
        <p>
          <span className="text-2xl font-semibold">{total}</span> <span className="text-sm text-ink-muted">日</span>
          <span className="ml-2 text-xs text-ink-muted">
            {weeks.length} 週のうち {active} 週で、いつもより多く動いた記録があります
          </span>
        </p>
      }
    >
      <WeeklyBarChart rows={rows} ariaLabel={`週ごとの、いつもより多く動いた日数。${weeks.length} 週のうち ${active} 週に記録があり、合計は ${total} 日。`} axis={{ domain: [0, 6], ticks: [0, 2, 4, 6] }} tick="int" format={{ kind: "days" }} valueName="運動した日" />
      <p className="text-xs text-ink-muted">棒は、その週に、いつもより多く動いた記録のある日の数です(0 の週は、ふだんどおり)。</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-ink-muted">表で見る</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 font-normal">週(月曜)</th>
                <th className="py-1 text-right font-normal">運動した日</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w) => (
                <tr key={w.weekStart} className="border-t border-line-soft">
                  <td className="py-1">{w.weekStart}</td>
                  <td className="py-1 text-right">{w.days} 日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
