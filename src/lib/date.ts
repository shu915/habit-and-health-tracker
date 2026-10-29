const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "2026-10-21" の形で、実在する日付なら true("2026-02-30" は false)
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
