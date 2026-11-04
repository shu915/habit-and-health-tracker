"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration } from "@/lib/duration";
import { nightClock, sleepAxis, sleepMedians, type SleepPoint } from "@/lib/trend";

// 睡眠の「浮いた棒」: 横軸は日付(起きた日)、縦軸は時刻(夜が上、朝が下)。帯の上端が就寝、下端が起床。細い線は、就寝と起床の真ん中(中間時刻)。
// 睡眠時間だけの棒より、就寝・起床のぶれが見える。記録の無い日は帯も線も出さない(0 にしない)。
// 高さを固定にするのは、サーバーが出す空の枠で場所を確保し、ブラウザで描かれてもレイアウトがずれないようにするため
export const SLEEP_CHART_HEIGHT = 220;

export function SleepChart({ points, syncId }: { points: SleepPoint[]; syncId?: string }) {
  const { domain, ticks } = sleepAxis(points);
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const medians = sleepMedians(points);
  const recorded = points.filter((p) => p.range !== null).length;

  return (
    <div style={{ height: SLEEP_CHART_HEIGHT }} role="img" aria-label={`睡眠の推移。${recorded === 0 ? "記録がありません。" : `記録は ${recorded} 日。睡眠時間の中央値は ${formatDuration(medians.minutes) ?? "-"}。`}`}>
      <ResponsiveContainer width="100%" height={SLEEP_CHART_HEIGHT}>
        <ComposedChart data={points} syncId={syncId} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} minTickGap={24} />
          {/* 縦軸は反転: 夜(前の夜の 18:00 側)が上、朝が下。目盛りは時刻で表す */}
          <YAxis reversed domain={domain} ticks={ticks} tickFormatter={nightClock} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<SleepTooltip />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {/* 帯(就寝〜起床)。細い棒(14px まで)、角は 4px 丸める */}
          <Bar dataKey="range" fill="var(--viz-series)" fillOpacity={0.85} maxBarSize={14} radius={4} isAnimationActive={false} />
          {/* 中間時刻: 細い線(記録の無い日は途切れる) */}
          <Line dataKey="midpoint" stroke="var(--viz-text)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" isAnimationActive={false} dot={false} connectNulls={false} activeDot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ホバーの表示: 日付、就寝、起床、睡眠時間、中間時刻(値を先に、名前はあとに)
function SleepTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: SleepPoint }[] }) {
  const point = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-background px-3 py-2 text-xs shadow-sm dark:border-zinc-700">
      <p className="text-zinc-500">{point.date}</p>
      {point.range === null || point.minutes === null || point.midpoint === null ? (
        // 帯が出せない日。片方の時刻だけ入っているときは、表と食い違わないよう、入っている時刻を出す
        <p className="font-medium">
          {point.bedtime !== null && point.wakeTime === null
            ? `就寝 ${point.bedtime}(起床が未入力)`
            : point.wakeTime !== null && point.bedtime === null
              ? `起床 ${point.wakeTime}(就寝が未入力)`
              : point.bedtime !== null && point.wakeTime !== null
                ? "就寝と起床が同じ時刻"
                : "記録なし"}
        </p>
      ) : (
        <>
          <p className="tabular-nums">
            <span className="font-medium">{formatDuration(point.minutes)}</span> <span className="text-zinc-500">睡眠時間</span>
          </p>
          <p className="tabular-nums">
            <span className="font-medium">{nightClock(point.range[0])}</span> <span className="text-zinc-500">就寝</span> ・ <span className="font-medium">{nightClock(point.range[1])}</span> <span className="text-zinc-500">起床</span>
          </p>
          <p className="tabular-nums">
            <span className="font-medium">{nightClock(Math.round(point.midpoint))}</span> <span className="text-zinc-500">中間時刻</span>
          </p>
        </>
      )}
    </div>
  );
}
