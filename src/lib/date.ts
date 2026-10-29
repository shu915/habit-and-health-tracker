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
