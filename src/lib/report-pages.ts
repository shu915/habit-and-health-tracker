import { clampPage } from "@/lib/day-pages";

// 定期レポート(月次)の一覧のページ分け。新しい月から 12 件ずつ(12 件 = 1 年ぶん)。随時の直近 4 週間は、ページの外(一覧の上に、別に 1 件だけ出す)。
// 件数は、1 人あたり 1 年に 12 件ほどなので、DB で区切らず、取ってきた一覧を、ここで切る(中身とスナップショットは読まない軽い一覧)
export const REPORTS_PER_PAGE = 12;

// 最後のページ(件数から決まる)。件数が 0 でも 1
export function reportsLastPage(total: number): number {
  return Math.max(1, Math.ceil(total / REPORTS_PER_PAGE));
}

// page ページ目(最後のページより先を指していたら、最後のページに寄せる)の、12 件と、実際のページ番号・最後のページ
export function pageOfReports<T>(items: readonly T[], page: number): { items: T[]; page: number; lastPage: number } {
  const lastPage = reportsLastPage(items.length);
  const current = clampPage(page, lastPage);
  return { items: items.slice((current - 1) * REPORTS_PER_PAGE, current * REPORTS_PER_PAGE), page: current, lastPage };
}
