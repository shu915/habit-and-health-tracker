import { zonedParts } from "@/lib/time-zone";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 受け付ける年の範囲。PostgreSQL の date は 0000 年を受け付けず、極端な年は入力ミスでしかないので絞る
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

// "2026-10-21" の形で、実在する日付(1900〜2100 年)なら true("2026-02-30" や "0000-01-01" は false)
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// 日本時間(lib/time-zone.ts)の今日を "YYYY-MM-DD" で返す。サーバーのタイムゾーンにも、端末のタイムゾーンにも左右されない
// (new Date().toISOString() は UTC なので、日本の朝に前日になる)
export function todayString(now: Date = new Date()): string {
  const { year, month, day } = zonedParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// 記録できる日付か: 実在する日付で、未来すぎない(今日の翌日まで)。
// 時計は日本時間に固定したので、「翌日まで」は、タイムゾーンのずれのためではなく、夜中の記録や時計の少しのずれに余裕を持たせるためのもの。
// 画面(ダッシュボードの日付欄)は、今日までしか選べない
export function isRecordableDate(value: string, now: Date = new Date()): boolean {
  if (!isValidDateString(value)) return false;
  return value <= shiftDate(todayString(now), 1);
}

// "2026-10-30" の前日・翌日(days 日ずらした日付)を返す。カレンダー上の計算なので、タイムゾーンの影響を受けない(UTC で計算する)
export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
