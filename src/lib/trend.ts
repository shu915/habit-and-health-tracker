import { shiftDate } from "@/lib/date";
import { sleepMinutes } from "@/lib/sleep";
import { splitTimeOfDay } from "@/lib/duration";

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

// --- 睡眠(就寝〜起床の浮いた棒) ---
// 縦軸は「前の夜の 18:00 からの分」(18:00 = 0、24:00 = 360、翌朝 8:00 = 840)。夜が上、朝が下になるよう、描くときは軸を反転する。
// 就寝は前の夜、起床は今朝で、起きた日の列に置く(日の行の規則と同じ)。起床は、就寝に睡眠時間(sleepMinutes)を足して決める(日をまたぐ判定を 1 か所に保つ)
export const SLEEP_AXIS_ORIGIN_MINUTES = 18 * 60;

// "23:30" → 330(18:00 を 0 とした分)。18:00 より前の時刻は、翌日側(24 時間足す)として数える。読めなければ null
export function nightOffset(time: string): number | null {
  const parts = splitTimeOfDay(time);
  if (!parts) return null;
  const minutes = parts.hours * 60 + parts.minutes;
  return minutes >= SLEEP_AXIS_ORIGIN_MINUTES ? minutes - SLEEP_AXIS_ORIGIN_MINUTES : minutes + 24 * 60 - SLEEP_AXIS_ORIGIN_MINUTES;
}

// 軸の分(18:00 を 0)→ "HH:MM"(2 桁。formatTimeOfDay に渡して「3時15分」の形にする)。24 時間を超えたら翌日の時刻に戻す
export function nightTimeOfDay(offset: number): string {
  const minutes = (((Math.round(offset) + SLEEP_AXIS_ORIGIN_MINUTES) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// 軸の分(18:00 を 0)→ "23:00" のような時刻の表示(縦軸の目盛りとホバー用。時は 1 桁のまま)。丸めと日またぎの戻しは nightTimeOfDay に任せる(変換を 1 か所に保つ)
export function nightClock(offset: number): string {
  const [hours, minutes] = nightTimeOfDay(offset).split(":");
  return `${Number(hours)}:${minutes}`;
}

export type SleepPoint = {
  date: string; // 起きた日
  range: [number, number] | null; // [就寝, 起床] の軸の分。睡眠時間が出せない日(どちらかが空・同じ時刻)は null
  midpoint: number | null; // 就寝と起床の真ん中の軸の分
  minutes: number | null; // 睡眠時間(分)
  bedtime: string | null;
  wakeTime: string | null;
};

// dates(古い順)の各日の睡眠の点を作る。byDate は日付 → 就寝・起床の時刻(行のある日)
export function buildSleepTrend(dates: readonly string[], byDate: ReadonlyMap<string, { bedtime: string | null; wakeTime: string | null }>): SleepPoint[] {
  return dates.map((date) => {
    const row = byDate.get(date);
    const bedtime = row?.bedtime ?? null;
    const wakeTime = row?.wakeTime ?? null;
    const minutes = sleepMinutes(bedtime, wakeTime);
    const start = bedtime === null ? null : nightOffset(bedtime);
    if (minutes === null || start === null) return { date, range: null, midpoint: null, minutes: null, bedtime, wakeTime };
    return { date, range: [start, start + minutes], midpoint: start + minutes / 2, minutes, bedtime, wakeTime };
  });
}

// 縦軸の範囲と目盛り: 記録のある帯が全部入るように、1 時間単位に広げる(帯が少ないときでも、4 時間以上)。目盛りは 1 時間か 2 時間おき
export function sleepAxis(points: readonly SleepPoint[]): { domain: [number, number]; ticks: number[] } {
  const ranges = points.flatMap((p) => (p.range ? [p.range] : []));
  if (ranges.length === 0) return { domain: [0, 720], ticks: [0, 120, 240, 360, 480, 600, 720] };
  const low = Math.floor((Math.min(...ranges.map(([start]) => start)) - 30) / 60) * 60;
  const high = Math.max(Math.ceil((Math.max(...ranges.map(([, end]) => end)) + 30) / 60) * 60, low + 240);
  const step = high - low > 480 ? 120 : 60;
  const top = low + Math.ceil((high - low) / step) * step;
  const ticks = Array.from({ length: (top - low) / step + 1 }, (_, i) => low + step * i);
  return { domain: [low, top], ticks };
}

// 中央値(並べたときの真ん中。偶数個なら、真ん中の 2 つの平均)。値が無ければ null。
// 徹夜や極端に短い日が混ざっても、平均のように引きずられない(「ふだんの睡眠」に近い)
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 睡眠のカードに出す数字: 睡眠のある日の、睡眠時間(分)・就寝・起床・中間時刻の「中央値」(平均は出さない。徹夜や極端な日に引きずられず、
// 時刻は日をまたいでも壊れない)。時刻は軸の分(18:00 を 0)で中央値を取ってから "HH:MM" にする。記録が無ければ、すべて null
export type SleepMedians = { minutes: number | null; bedtime: string | null; wakeTime: string | null; midpoint: string | null };

export function sleepMedians(points: readonly SleepPoint[]): SleepMedians {
  const ranged = points.flatMap((p) => (p.range !== null && p.minutes !== null && p.midpoint !== null ? [{ range: p.range, minutes: p.minutes, midpoint: p.midpoint }] : []));
  const clock = (values: number[]) => {
    const value = median(values);
    return value === null ? null : nightTimeOfDay(value);
  };
  const minutes = median(ranged.map((p) => p.minutes));
  return {
    minutes: minutes === null ? null : Math.round(minutes),
    bedtime: clock(ranged.map((p) => p.range[0])),
    wakeTime: clock(ranged.map((p) => p.range[1])),
    midpoint: clock(ranged.map((p) => p.midpoint)),
  };
}
