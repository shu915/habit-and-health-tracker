"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { highlightLines } from "@/components/chart-highlights";
import type { CalorieChartPoint } from "@/components/calorie-chart";
import { balanceAxis, balanceSummary } from "@/lib/calorie-trend";

// 日ごとの「摂取 − 消費の目安」の棒。0 を境に、消費より少なく食べた日は下(青)、多く食べた日は上(オレンジ)に伸びる。
// 食事の記録が無い日・消費が出せない日は、棒を出さない(0 にしない)。書きかけの日の棒は薄くする(まだ増える値)。
// 推定どうしの差(目安)で、1 日の誤差は大きい。見るのは日々の値より、中央値や傾向。高さは固定(サーバーが場所を確保する)
export const BALANCE_CHART_HEIGHT = 220;

const kcal = (value: number) => `${value.toLocaleString("ja-JP")} kcal`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${kcal(value)}`;

export function CalorieBalanceChart({ points, syncId, highlightDates = [] }: { points: CalorieChartPoint[]; syncId?: string; highlightDates?: readonly string[] }) {
  const { domain, ticks } = balanceAxis(points);
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const withDiff = points.filter((p) => p.diffKcal !== null);
  const medianDiff = balanceSummary(points)?.medianKcal ?? null; // カードの見出しと同じ計算
  const overDays = withDiff.filter((p) => (p.diffKcal ?? 0) > 0).length;

  return (
    <div style={{ height: BALANCE_CHART_HEIGHT }} role="img" aria-label={`摂取から消費の目安を引いた差の推移。${withDiff.length === 0 ? "差を出せる日がありません。" : `差を出せた日は ${withDiff.length} 日。${medianDiff === null ? "" : `過ぎた日の差の中央値は ${signed(medianDiff)}。`}消費の目安より多く食べた日は ${overDays} 日。`}`}>
      <ResponsiveContainer width="100%" height={BALANCE_CHART_HEIGHT}>
        <ComposedChart data={points} syncId={syncId} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={domain} ticks={ticks} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<BalanceTooltip />} cursor={{ stroke: "var(--viz-ring)", strokeWidth: 1 }} />
          {highlightLines(highlightDates)}
          <ReferenceLine y={0} stroke="var(--viz-text)" strokeWidth={1} />
          <Bar dataKey="diffKcal" maxBarSize={14} radius={2} isAnimationActive={false}>
            {points.map((point) => (
              <Cell key={point.date} fill={(point.diffKcal ?? 0) > 0 ? "var(--viz-over)" : "var(--viz-series)"} fillOpacity={point.inProgress ? 0.35 : 0.85} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ホバーの表示: 日付、差、内訳(摂取と消費の目安)。値を先に、名前はあとに
function BalanceTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: CalorieChartPoint }[] }) {
  const point = active ? payload?.find((item) => item.payload !== undefined)?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-background px-3 py-2 text-xs shadow-sm dark:border-zinc-700">
      <p className="text-zinc-500">
        {point.date}
        {point.inProgress && "(途中)"}
      </p>
      {point.diffKcal === null || point.intake === null || point.burnKcal === null ? (
        <p className="text-zinc-500">{point.intake === null ? "食事の記録なし" : "消費の目安を出せません"}</p>
      ) : (
        <>
          <p className="tabular-nums">
            <span className="font-medium">{signed(point.diffKcal)}</span> <span className="text-zinc-500">{point.diffKcal > 0 ? "消費の目安より多い" : "消費の目安より少ない"}</span>
          </p>
          <p className="tabular-nums text-zinc-500">
            摂取 {point.intake.toLocaleString("ja-JP")} − 消費の目安 {point.burnKcal.toLocaleString("ja-JP")}
          </p>
        </>
      )}
    </div>
  );
}
