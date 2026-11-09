"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { highlightLines } from "@/components/chart-highlights";
import { calorieAxis, intakeSummary, type CalorieDayPoint } from "@/lib/calorie-trend";

// 日ごとの摂取カロリーの棒と、目標となるカロリーの線。
// 棒は 0 から始める(棒の長さが値)。食事の記録が無い日は、棒を出さない(0 にしない)。書きかけの日(inProgress)の棒は薄くする(まだ増える値)。
// 目標の線は、その日に固定した目標カロリー + その日の運動の消費(日の詳細の栄養の比べと同じ)なので、運動した日は少し上がる。破線の細い線で、棒より目立たせない。
// 高さを固定にするのは、サーバーが出す空の枠で場所を確保し、ブラウザで描かれてもレイアウトがずれないようにするため
export const CALORIE_CHART_HEIGHT = 220;

// sparse: データが不足している日(lib/sparse-day.ts)。棒を薄くし、中央値から外す
export type CalorieChartPoint = CalorieDayPoint & { inProgress: boolean; sparse?: boolean };

const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;

export function CalorieChart({ points, syncId, highlightDates = [] }: { points: CalorieChartPoint[]; syncId?: string; highlightDates?: readonly string[] }) {
  const { domain, ticks } = calorieAxis(points);
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const recorded = points.filter((p) => p.intake !== null).length;
  // 読み上げ用の数字(見出しと同じ: 過ぎた日の摂取の中央値、いちばん新しい日の目標となるカロリー)
  const { median: medianIntake } = intakeSummary(points); // データがそろった日が足りないときは null(読み上げでも、不正確な値を言わない)
  const latestTarget = [...points].reverse().find((p) => p.target !== null)?.target ?? null;

  return (
    <div style={{ height: CALORIE_CHART_HEIGHT }} role="img" aria-label={`摂取カロリーと目標となるカロリーの推移。${recorded === 0 ? "食事の記録がありません。" : `食事の記録は ${recorded} 日。${medianIntake === null ? "" : `過ぎた日の摂取の中央値は ${kcal(Math.round(medianIntake))}。`}${latestTarget === null ? "" : `目標となるカロリーは ${kcal(latestTarget)}。`}`}`}>
      <ResponsiveContainer width="100%" height={CALORIE_CHART_HEIGHT}>
        <ComposedChart data={points} syncId={syncId} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} minTickGap={24} />
          <YAxis domain={domain} ticks={ticks} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<CalorieTooltip />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {highlightLines(highlightDates)}
          {/* 摂取: 細い棒(14px まで)。データの端(上)だけ 4px 丸め、基線側は四角 */}
          <Bar dataKey="intake" maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {points.map((point) => (
              <Cell key={point.date} fill="var(--viz-series)" fillOpacity={point.inProgress || point.sparse === true ? 0.35 : 0.85} />
            ))}
          </Bar>
          {/* 目標となるカロリー: 破線の細い線。目標が決まっていない日は途切れる */}
          <Line dataKey="target" stroke="var(--viz-text)" strokeWidth={1.5} strokeDasharray="5 4" isAnimationActive={false} dot={false} connectNulls={false} activeDot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ホバーの表示: 日付、摂取、目標となるカロリー(内訳: 目標カロリー + 運動)。値を先に、名前はあとに
function CalorieTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: CalorieChartPoint }[] }) {
  const point = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-sm">
      <p className="text-ink-muted">
        {point.date}
        {point.inProgress && "(途中)"}
        {point.sparse === true && "(データ不足)"}
      </p>
      <p className="tabular-nums">
        <span className="font-medium">{point.intake === null ? "食事の記録なし" : kcal(point.intake)}</span> {point.intake !== null && <span className="text-ink-muted">摂取</span>}
      </p>
      {point.target !== null && (
        <p className="tabular-nums">
          <span className="font-medium">{kcal(point.target)}</span> <span className="text-ink-muted">目標となるカロリー</span>
          {point.exerciseKcal > 0 && point.baseKcal !== null && (
            <span className="block text-ink-muted">
              目標カロリー {point.baseKcal.toLocaleString("ja-JP")} + 運動 {point.exerciseKcal.toLocaleString("ja-JP")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
