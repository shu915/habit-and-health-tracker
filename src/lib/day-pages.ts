import { shiftDate } from "@/lib/date";

// ダッシュボードの一覧のページ分け。1 ページ = 14 日(2 週間。月の長さに左右されず、曜日の並びがそろう。1 行を大きくしても縦に長くなりすぎない)。
// 今日から過去へさかのぼる。ページの境目は月や週に合わせず、「今日から数えて 14 日ずつ」
export const DAYS_PER_PAGE = 14;

// URL の ?page= の値を、1 以上の整数にする。読めない値・7 桁以上は 1(範囲外の大きな値の寄せ先は、呼び出し側が最後のページに丸める)
export function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}

// ページ(1 から)の期間。from〜to(両端を含む)は 14 日分
export function pageRange(today: string, page: number): { from: string; to: string } {
  const to = shiftDate(today, -DAYS_PER_PAGE * (page - 1));
  return { from: shiftDate(to, -(DAYS_PER_PAGE - 1)), to };
}

// from〜to のすべての日付を、新しい順に並べる(記録の無い日も含める)
export function datesDescending(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = to; date >= from; date = shiftDate(date, -1)) dates.push(date);
  return dates;
}

// 最後のページ(最初の記録の日を含むページ)。記録が無い、または最初の記録が未来なら 1
export function lastPage(today: string, firstDate: string | null): number {
  if (firstDate === null || firstDate >= today) return 1;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.ceil(days / DAYS_PER_PAGE);
}

// 最後のページより先を指していたら、最後のページに寄せる
export function clampPage(page: number, last: number): number {
  return Math.min(page, last);
}

// 1 ページ分の表示する日付(新しい順)。記録の無い日も含める。
// 1 ページ目だけ、サーバーの「明日」も、記録があるときに限って先頭に足す: サーバーは翌日までの日付を保存できる(isRecordableDate)ので、
// サーバーが UTC で利用者が日本のとき、朝に保存した「利用者の今日」の記録は、サーバーの明日の日付になり、足さないと一覧から消える。
// 記録の無い明日の行は出さない(日付欄から入る)
// 最初の記録の日(その人の開始日)より前の日は出さない(最後のページの下に、空の行が続かない)
export function pageDates(today: string, page: number, recordedDates: ReadonlySet<string>, firstDate: string | null): string[] {
  const { from, to } = pageRange(today, page);
  const tomorrow = shiftDate(today, 1);
  // 開始日が今日より後(初日の記録がサーバーの明日になった)ときは、今日の行を残す
  const start = firstDate !== null && firstDate > from ? (firstDate < to ? firstDate : to) : from;
  const dates = datesDescending(start, to);
  return page === 1 && recordedDates.has(tomorrow) ? [tomorrow, ...dates] : dates;
}
