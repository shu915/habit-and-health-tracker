import type { WeekCount, WeekPoint } from "@/lib/weekly-points";

// 週ごとのグラフ(components/weekly-chart.tsx)に渡す、軸と行の作り(DB を読まない純粋な関数)。
// ブラウザ側の部品("use client")のファイルに置くと、サーバーの部品(weekly-cards.tsx)から呼べないので、ここに分ける

// 値の表示と、縦軸の目盛りの表示は、「設定の値」で渡す(関数は、サーバーの部品から、ブラウザ側のグラフに渡せない)。グラフの中で、ここから関数を作る
export type FormatSpec = { kind: "hoursMinutes" } | { kind: "fixed"; digits: number } | { kind: "kcal" } | { kind: "days" };
export type TickSpec = "int" | "hours" | "thousands";

export function formatterOf(spec: FormatSpec): (value: number) => string {
  switch (spec.kind) {
    case "hoursMinutes":
      return (value) => `${Math.floor(value / 60)} 時間 ${String(Math.round(value % 60)).padStart(2, "0")} 分`;
    case "fixed":
      return (value) => value.toFixed(spec.digits);
    case "kcal":
      return (value) => `${Math.round(value).toLocaleString("ja-JP")} kcal`;
    case "days":
      return (value) => `${value} 日`;
  }
}

export function tickFormatterOf(spec: TickSpec): (value: number) => string {
  if (spec === "hours") return (value) => String(value / 60);
  if (spec === "thousands") return (value) => value.toLocaleString("ja-JP");
  return (value) => String(value);
}

export const withUnit = (format: (value: number) => string, unit: string) => (value: number) => (unit === "" ? format(value) : `${format(value)} ${unit}`);

// 縦軸の目盛り(4 つ)。値の幅に少し余白を足して、きりのよい step の倍数に丸める。floor0 なら、0 から始める(棒用)
export function weeklyAxis(values: readonly number[], step: number, options: { floor0?: boolean } = {}): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, step * 3], ticks: [0, 1, 2, 3].map((i) => i * step) };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const low = options.floor0 === true ? 0 : Math.floor((min - step * 0.25) / step) * step;
  const high = Math.max(low + step * 3, Math.ceil((max + step * 0.25) / step) * step);
  const unit = Math.max(step, Math.ceil((high - low) / 3 / step) * step); // 目盛りの間隔(step の倍数)
  const ticks = [0, 1, 2, 3].map((i) => low + unit * i);
  return { domain: [ticks[0], ticks[3]], ticks };
}

// 週ごとの棒の 1 行。target は、棒と同じ週の並びの、目標の線(無ければ null)
export type BarRow = { weekStart: string; label: string; value: number | null; target: number | null };

// 運動の週ごとの日数を、棒の行にする
export const countRows = (weeks: readonly WeekCount[]): BarRow[] => weeks.map((w) => ({ weekStart: w.weekStart, label: w.label, value: w.days, target: null }));
// 摂取と目標(同じ週の並び)を、棒の行にする
export const intakeRows = (intake: readonly WeekPoint[], target: readonly WeekPoint[]): BarRow[] => intake.map((w, i) => ({ weekStart: w.weekStart, label: w.label, value: w.median, target: target[i]?.median ?? null }));
