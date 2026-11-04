import { SleepChart } from "@/components/sleep-chart";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { nightClock, sleepMedians, type SleepPoint } from "@/lib/trend";

// 睡眠のカード: 見出しに睡眠時間の中央値と、就寝・起床・中間時刻の中央値、凡例(帯と線)、図、表の形の代替
export function SleepCard({ points, syncId }: { points: SleepPoint[]; syncId: string }) {
  const recorded = points.filter((p) => p.range !== null).length;
  const medians = sleepMedians(points);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-sm font-medium text-zinc-500">睡眠</h3>
        {recorded > 0 ? (
          <>
            <p>
              <span className="text-2xl font-semibold">{formatDuration(medians.minutes)}</span> <span className="text-sm text-zinc-500">睡眠時間の中央値</span>
            </p>
            {/* 数字はすべて中央値(徹夜や極端に短い日が混ざっても引きずられない「ふだんの値」。時刻は日をまたいでも壊れない) */}
            <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <MedianTime label="就寝" value={medians.bedtime} />
              <MedianTime label="起床" value={medians.wakeTime} />
              <MedianTime label="中間時刻" value={medians.midpoint} />
            </dl>
            <p className="mt-1 text-xs text-zinc-500">
              すべて中央値 ・ {points.length} 日中 {recorded} 日に記録
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">この期間の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && (
        <>
          {/* 凡例: 帯(四角)と、中間時刻(線)。色だけに頼らず、名前で区別する */}
          <p className="flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              就寝〜起床
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--viz-text)" }} />
              中間時刻
            </span>
          </p>
          <SleepChart points={points} syncId={syncId} />
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">就寝</th>
                    <th className="py-1 text-right font-normal">起床</th>
                    <th className="py-1 text-right font-normal">睡眠時間</th>
                    <th className="py-1 text-right font-normal">中間時刻</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="py-1">{p.date}</td>
                      <td className="py-1 text-right">{p.bedtime ?? "-"}</td>
                      <td className="py-1 text-right">{p.wakeTime ?? "-"}</td>
                      <td className="py-1 text-right">{formatDuration(p.minutes) ?? "-"}</td>
                      <td className="py-1 text-right">{p.midpoint === null ? "-" : nightClock(Math.round(p.midpoint))}</td>
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

// 睡眠の時刻の中央値 1 つ分(「就寝 1時40分」)。値は "HH:MM"
function MedianTime({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums">{formatTimeOfDay(value) ?? "-"}</dd>
    </div>
  );
}
