import { shiftDate } from "@/lib/date";

// 日ごとの値の推移(体重・体脂肪率の折れ線の元)。AI は使わない。グラフと、あとの AI のフィードバックの共通の土台。
// 値は、日の行の朝の記録から取る(記録の無い日は null。0 にはしない)

// 表示する期間(日数)。28 日 = 4 週で、どの曜日もちょうど 4 回ずつ入る。7 日移動平均の 4 周期ぶんでもある
export const TREND_RANGES = [7, 28, 90] as const;
export type TrendRange = (typeof TREND_RANGES)[number];
export const DEFAULT_TREND_RANGE: TrendRange = 28;

// 移動平均の窓(その日を含めて過去 7 日)と、平均を出すのに要る記録の数。記録が 1 つだけの窓は、平均と呼べないので出さない
export const MOVING_AVERAGE_DAYS = 7;
export const MOVING_AVERAGE_MIN_COUNT = 2;

// URL の ?range= の値を、期間にする。読めない値・一覧に無い値は、既定の 28 日
export function parseTrendRange(raw: string | string[] | undefined): TrendRange {
  const found = TREND_RANGES.find((days) => String(days) === raw);
  return found ?? DEFAULT_TREND_RANGE;
}

// end までの days 日分の日付(古い順)。end を含む
export function trendDates(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDate(end, i - (days - 1)));
}

export type TrendPoint = {
  date: string;
  value: number | null; // その日の朝の値。記録が無ければ null
  average: number | null; // その日を含む過去 7 日の平均。記録が MOVING_AVERAGE_MIN_COUNT 個に満たなければ null
};

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

// dates(古い順)の各日の値と移動平均を作る。byDate は日付 → 値(記録のある日だけ)。
// 期間の最初の日の平均にも、その前の 6 日の記録が要るので、byDate には、期間より 6 日前からの記録を入れておく。
// digits は平均を丸める小数の桁数(体重 2、体脂肪率 1)
export function buildTrend(dates: readonly string[], byDate: ReadonlyMap<string, number>, digits: number): TrendPoint[] {
  return dates.map((date) => {
    const window: number[] = [];
    for (let back = 0; back < MOVING_AVERAGE_DAYS; back++) {
      const value = byDate.get(shiftDate(date, -back));
      if (value !== undefined) window.push(value);
    }
    const average = window.length >= MOVING_AVERAGE_MIN_COUNT ? round(window.reduce((sum, v) => sum + v, 0) / window.length, digits) : null;
    return { date, value: byDate.get(date) ?? null, average };
  });
}

// 記録の行(日付と、文字列の値)から、日付 → 数値の対応を作る。null の日は入れない
export function valuesByDate(rows: readonly { date: string; value: string | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) if (row.value !== null) map.set(row.date, Number(row.value));
  return map;
}

// 期間の最後の日。今日までが基本。ただし、サーバーの明日の日付に朝の記録がある日は、明日までにする
// (サーバーが UTC のとき、日本の朝に保存した「利用者の今日」の記録は、サーバーから見ると明日の日付になる。入れないと、保存した直後の値がグラフに出ない)。
// 期間の日数は変わらない(末尾が 1 日ずれるだけ)
export function trendEnd(today: string, datesWithMeasure: ReadonlySet<string>): string {
  const tomorrow = shiftDate(today, 1);
  return datesWithMeasure.has(tomorrow) ? tomorrow : today;
}

// 最新の記録の点(その日の値がある、いちばん新しい日)と、最新の平均の点。無ければ undefined
export function latestRecorded(points: readonly TrendPoint[]): TrendPoint | undefined {
  return [...points].reverse().find((p) => p.value !== null);
}
export function latestAverage(points: readonly TrendPoint[]): TrendPoint | undefined {
  return [...points].reverse().find((p) => p.average !== null);
}
