"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { highlightLines } from "@/components/chart-highlights";
import { latestAverage, latestRecorded, type TrendPoint } from "@/lib/trend";

// 日ごとの値の折れ線(1 つの測定値だけ。体重と体脂肪率は単位が違うので、2 つの図に分ける。軸を 2 本にしない)。
// 系列は 1 色: その日の値は薄い点(文脈)、7 日移動平均は 2px の線(主役)。記録の無い日は線を途切れさせる(0 にしない)。
// 高さを固定にするのは、サーバーが出す空の枠で場所を確保し、ブラウザで描かれてもレイアウトがずれないようにするため(ResponsiveContainer は幅を測るまで描かない)
export const CHART_HEIGHT = 180;

// syncId: 同じ値を持つ図どうしは、ホバーが連動する(片方に乗せると、もう片方にも同じ日の十字線と値が出る。同じ日付の並びの図だけに使う)
export function TrendChart({ title, unit, digits, points, syncId, highlightDates = [] }: { title: string; unit: string; digits: number; points: TrendPoint[]; syncId?: string; highlightDates?: readonly string[] }) {
  const values = points.flatMap((p) => [p.value, p.average]).filter((v): v is number => v !== null);
  // 縦軸は 0 から始めず、値の幅に少し余白を足して、きりのよい整数に丸める(線グラフは、変化の形が読めればよい)。
  // 目盛りは 4 つの整数にそろえる(幅が 3 で割り切れないと、71.33 のような目盛りが出るため、幅を 3 の倍数に広げる)
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.2, 0.5);
  const low = values.length === 0 ? 0 : Math.floor(min - pad);
  const step = values.length === 0 ? 1 : Math.max(1, Math.ceil((Math.ceil(max + pad) - low) / 3));
  const ticks = [0, 1, 2, 3].map((i) => low + step * i);
  const domain: [number, number] = [ticks[0], ticks[3]];

  const format = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

  return (
    <div style={{ height: CHART_HEIGHT }} role="img" aria-label={`${title}の推移。${summary(points, unit, format)}`}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={points} syncId={syncId} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} minTickGap={24} />
          <YAxis domain={domain} ticks={ticks} tickFormatter={(v: number) => String(v)} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<TrendTooltip unit={unit} format={format} />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {highlightLines(highlightDates)}
          {/* その日の値: 線でつながず、薄い点だけ(記録の無い日は点が無い) */}
          <Line dataKey="value" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: "var(--viz-series)", fillOpacity: 0.4, stroke: "none" }} activeDot={false} />
          {/* 7 日移動平均: 2px の線。記録が足りない日は途切れる */}
          <Line dataKey="average" stroke="var(--viz-series)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" isAnimationActive={false} dot={false} connectNulls={false} activeDot={{ r: 4, fill: "var(--viz-series)", stroke: "var(--viz-surface)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 読み上げ用の要約: 記録のある日の数と、最新の値と平均
function summary(points: readonly TrendPoint[], unit: string, format: (v: number) => string): string {
  const recorded = points.filter((p) => p.value !== null);
  if (recorded.length === 0) return "記録がありません。";
  const latest = latestRecorded(points);
  const average = latestAverage(points);
  return `記録は ${recorded.length} 日。最新は ${format(latest?.value ?? 0)} ${unit}${average?.average != null ? `、7 日移動平均は ${format(average.average)} ${unit}` : ""}。`;
}

// ホバーの表示: 日付、その日の値、7 日移動平均(値を先に、名前はあとに)。十字線は日付に吸い付く
function TrendTooltip({ active, payload, unit, format }: { active?: boolean; payload?: readonly { payload?: TrendPoint }[]; unit: string; format: (v: number) => string }) {
  const point = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-sm">
      <p className="text-ink-muted">{point.date}</p>
      <p className="tabular-nums">
        <span className="font-medium">{point.value === null ? "記録なし" : `${format(point.value)} ${unit}`}</span> <span className="text-ink-muted">その日</span>
      </p>
      {point.average !== null && (
        <p className="tabular-nums">
          <span className="font-medium">{format(point.average)} {unit}</span> <span className="text-ink-muted">7 日移動平均</span>
        </p>
      )}
    </div>
  );
}
