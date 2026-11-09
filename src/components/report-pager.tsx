import Link from "next/link";
import { buttonClass } from "@/components/button";

// 月次レポートの一覧のページ送り。「新しい」ほうが 1 ページ目、「古い」ほうが過去。端では、そちらのリンクを出さない。
// 移動後は、月次レポートの一覧の位置に合わせる(ボタンは一覧の下にあるので、ページの一番上に戻すと、作る画面が見えてしまう)
export const PERIODIC_LIST_ID = "periodic-reports";
const hrefOf = (page: number) => (page === 1 ? `/reports#${PERIODIC_LIST_ID}` : `/reports?page=${page}#${PERIODIC_LIST_ID}`);

export function ReportPager({ page, lastPage }: { page: number; lastPage: number }) {
  if (lastPage <= 1) return null;
  return (
    <nav aria-label="月次レポートのページ" className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-32">
        {page > 1 && (
          <Link href={hrefOf(page - 1)} className={buttonClass({ variant: "secondary" })}>
            ← 新しいレポート
          </Link>
        )}
      </div>
      <p className="text-xs text-ink-muted tabular-nums">
        {page} / {lastPage} ページ
      </p>
      <div className="flex min-w-32 justify-end">
        {page < lastPage && (
          <Link href={hrefOf(page + 1)} className={buttonClass({ variant: "secondary" })}>
            古いレポート →
          </Link>
        )}
      </div>
    </nav>
  );
}
