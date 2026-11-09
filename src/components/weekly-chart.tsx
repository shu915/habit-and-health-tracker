"use client";

import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatterOf, tickFormatterOf, withUnit, type BarRow, type FormatSpec, type TickSpec } from "@/lib/weekly-chart-data";
import type { WeekPoint } from "@/lib/weekly-points";

// 長期レポート(四半期・年)の、週ごとのグラフ(1 本 = 1 週間。月曜始まり。lib/weekly-points.ts)。
// 線 + 薄い帯: 線は、その週の中央値、帯は、その週の最小から最大(ばらつき。帯が太い週は、揺れが大きい週)。色の意味づけは要らない(1 色)。
// 記録が少ない週は、点を出さず、線を途切れさせる(0 にしない)。軸は 1 本。高さを固定にするのは、サーバーが出す空の枠で場所を確保し、ブラウザで描かれてもレイアウトがずれないようにするため
export const WEEKLY_CHART_HEIGHT = 200;

const axisText = { fill: "var(--viz-text)", fontSize: 11 } as const;

type BandRow = WeekPoint & { band: [number, number] | null };

// props は、サーバーの部品から渡るので、関数を含めない(format・tick は設定の値。ここで関数にする)
export function WeeklyBandChart({ points, ariaLabel, axis, tick, format, unit }: { points: readonly WeekPoint[]; ariaLabel: string; axis: { domain: [number, number]; ticks: number[] }; tick: TickSpec; format: FormatSpec; unit: string }) {
  const tickFormat = tickFormatterOf(tick);
  const formatValue = withUnit(formatterOf(format), unit);
  const data: BandRow[] = points.map((p) => ({ ...p, band: p.low === null || p.high === null ? null : [p.low, p.high] }));
  return (
    <div style={{ height: WEEKLY_CHART_HEIGHT }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={WEEKLY_CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tick={axisText} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} minTickGap={28} />
          <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={tickFormat} tick={axisText} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<BandTooltip format={formatValue} />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {/* ばらつきの帯(最小〜最大)。薄く、線より目立たせない */}
          <Area dataKey="band" stroke="none" fill="var(--viz-series)" fillOpacity={0.16} isAnimationActive={false} activeDot={false} connectNulls={false} />
          {/* 週の中央値: 2px の線 */}
          <Line dataKey="median" stroke="var(--viz-series)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" isAnimationActive={false} dot={{ r: 2.5, fill: "var(--viz-series)", stroke: "none" }} connectNulls={false} activeDot={{ r: 4, fill: "var(--viz-series)", stroke: "var(--viz-surface)", strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function BandTooltip({ active, payload, format }: { active?: boolean; payload?: readonly { payload?: BandRow }[]; format: (value: number) => string }) {
  const row = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-sm">
      <p className="text-ink-muted">{row.label} からの週</p>
      {row.median === null ? (
        <p>記録が少ない週</p>
      ) : (
        <>
          <p className="tabular-nums">
            <span className="font-medium">{format(row.median)}</span> <span className="text-ink-muted">中央値</span>
          </p>
          <p className="tabular-nums text-ink-muted">
            {format(row.low ?? row.median)} 〜 {format(row.high ?? row.median)}(記録 {row.recorded} 日)
          </p>
        </>
      )}
    </div>
  );
}

// 週ごとの棒(0 から始める)。摂取カロリー(目標の線つき)と、運動した日数。target は、棒と同じ週の並びの、目標の線(破線の細い線)

export function WeeklyBarChart({ rows, ariaLabel, axis, tick, format, valueName, targetName }: { rows: readonly BarRow[]; ariaLabel: string; axis: { domain: [number, number]; ticks: number[] }; tick: TickSpec; format: FormatSpec; valueName: string; targetName?: string }) {
  const tickFormat = tickFormatterOf(tick);
  const formatValue = formatterOf(format);
  return (
    <div style={{ height: WEEKLY_CHART_HEIGHT }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={WEEKLY_CHART_HEIGHT}>
        <ComposedChart data={[...rows]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tick={axisText} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} minTickGap={28} />
          <YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={tickFormat} tick={axisText} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<BarTooltip format={formatValue} valueName={valueName} targetName={targetName} />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {/* 細い棒(14px まで)。データの端(上)だけ 4px 丸め、基線側は四角 */}
          <Bar dataKey="value" fill="var(--viz-series)" fillOpacity={0.85} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          {targetName !== undefined && <Line dataKey="target" stroke="var(--viz-text)" strokeWidth={1.5} strokeDasharray="5 4" isAnimationActive={false} dot={false} connectNulls={false} activeDot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarTooltip({ active, payload, format, valueName, targetName }: { active?: boolean; payload?: readonly { payload?: BarRow }[]; format: (value: number) => string; valueName: string; targetName?: string }) {
  const row = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-sm">
      <p className="text-ink-muted">{row.label} からの週</p>
      <p className="tabular-nums">
        <span className="font-medium">{row.value === null ? "記録が少ない週" : format(row.value)}</span> {row.value !== null && <span className="text-ink-muted">{valueName}</span>}
      </p>
      {targetName !== undefined && row.target !== null && (
        <p className="tabular-nums">
          <span className="font-medium">{format(row.target)}</span> <span className="text-ink-muted">{targetName}</span>
        </p>
      )}
    </div>
  );
}
