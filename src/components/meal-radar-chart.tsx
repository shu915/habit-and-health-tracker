"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, Tooltip } from "recharts";
import { CHART_MAX_PERCENT, type RadarAxis } from "@/lib/meal-radar";

// 1 日の栄養のレーダーチャート。目標は、軸ごとの幅(ゾーン)を薄い帯で示す(帯の真ん中が 100%)。系列は 1 つ(その日)なので、凡例は置かず、見出しと横の表が名前と値を担う。
// 大きさを固定にするのは、サーバーが出す空の枠で場所を確保し、ブラウザで描かれてもレイアウトがずれないようにするため(ResponsiveContainer は幅を測るまで描かない)。
// 書きかけの日(inProgress)は、輪郭を点線にして薄くする(まだ増える値なので、確定した形に見せない)
const SIZE = { width: 290, height: 270 };

type ChartRow = Pick<RadarAxis, "label" | "unit" | "actual" | "reference" | "percent" | "chartPercent">;

export function MealRadarChart({ axes, inProgress }: { axes: readonly RadarAxis[]; inProgress: boolean }) {
  // ゾーンの帯: [下端, 上端] の範囲として 1 つの系列で描く(中は塗らず、格子線が見える。上端が無い軸は、グラフの端まで)。目標が無い軸は帯なし
  const data: (ChartRow & { zone: [number, number] })[] = axes.map((axis) => ({
    label: axis.label,
    unit: axis.unit,
    actual: axis.actual,
    reference: axis.reference,
    percent: axis.percent,
    chartPercent: axis.chartPercent,
    zone: axis.reference === null ? [0, 0] : [axis.zoneLow, Math.min(axis.zoneHigh ?? CHART_MAX_PERCENT, CHART_MAX_PERCENT)],
  }));

  return (
    <div
      role="img"
      aria-label={`栄養の目標に対する割合: ${axes.map((a) => `${a.label} ${a.percent === null ? "目標なし" : `${a.percent}%`}`).join("、")}`}
      className="flex justify-center"
    >
      <RadarChart {...SIZE} data={data} outerRadius="78%" margin={{ top: 8, right: 36, bottom: 8, left: 24 }}>
        <PolarAngleAxis dataKey="label" tick={{ fill: "var(--viz-text)", fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, CHART_MAX_PERCENT]} tick={false} axisLine={false} />
        <PolarGrid stroke="var(--viz-grid)" />
        {/* 目標のゾーン(帯)。データより目立たせないよう、灰色で薄く塗り、縁は点線 */}
        <Radar dataKey="zone" isRange fillRule="evenodd" stroke="var(--viz-ring)" strokeDasharray="4 3" fill="var(--viz-ring)" fillOpacity={0.18} isAnimationActive={false} dot={false} activeDot={false} />
        <Radar
          dataKey="chartPercent"
          stroke="var(--viz-series)"
          strokeWidth={2}
          strokeDasharray={inProgress ? "5 4" : undefined}
          fill="var(--viz-series)"
          fillOpacity={inProgress ? 0.12 : 0.28}
          isAnimationActive={false}
          dot={{ r: 4, fill: "var(--viz-series)", stroke: "var(--viz-surface)", strokeWidth: 2 }}
        />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </div>
  );
}

// ホバーの表示: 栄養素の名前、実際の値、目標、割合(描画は頭打ちでも、ここは実際の割合)
function RadarTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: ChartRow }[] }) {
  const row = active ? payload?.find((item) => item.payload?.label !== undefined)?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{row.label}</p>
      <p className="tabular-nums">
        {row.actual.toLocaleString("ja-JP")} {row.unit}
        {row.reference !== null && <span className="text-ink-muted"> / 目標 {row.reference.toLocaleString("ja-JP")} {row.unit}</span>}
      </p>
      {row.percent !== null && <p className="tabular-nums text-ink-muted">{row.percent}%</p>}
    </div>
  );
}
