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

// この端末(ローカル時間)の今日を "YYYY-MM-DD" で返す。new Date().toISOString() は UTC なので日本の朝に前日になる
export function todayString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// 記録できる日付か: 実在する日付で、未来すぎない(今日の翌日まで)。
// サーバーは使う人のタイムゾーンを知らない(サーバーが UTC で、利用者が日本のとき、利用者の「今日」はサーバーの「明日」)ので、
// 翌日までは許す。画面(ダッシュボードの日付欄)は、端末の今日までしか選べない
export function isRecordableDate(value: string, now: Date = new Date()): boolean {
  if (!isValidDateString(value)) return false;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return value <= todayString(tomorrow);
}

// "2026-10-30" の前日・翌日(days 日ずらした日付)を返す。カレンダー上の計算なので、タイムゾーンの影響を受けない(UTC で計算する)
export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
