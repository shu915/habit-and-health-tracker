import Link from "next/link";
import { buttonClass } from "@/components/button";
import { DAYS_PER_PAGE } from "@/lib/day-pages";

// 一覧のページ送り(期間の表示は、一覧の見出しの横)。「新しい」ほうが 1 ページ目(今日側)、「古い」ほうが過去。端では、そちらのリンクを出さない
// 移動後は、一覧の見出し(day-list.tsx の id)の位置に合わせる。ボタンは一覧の下にあるので、ページの一番上へ戻すと、上のプロフィール欄が見えてしまう
export const DAY_LIST_ID = "day-list";
const hrefOf = (page: number) => (page === 1 ? `/#${DAY_LIST_ID}` : `/?page=${page}#${DAY_LIST_ID}`);

export function DayPager({ page, lastPage }: { page: number; lastPage: number }) {
  return (
    <nav aria-label="期間の移動" className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-32">
        {page > 1 && (
          <Link href={hrefOf(page - 1)} className={buttonClass({ variant: "secondary" })}>
            ← 新しい {DAYS_PER_PAGE} 日
          </Link>
        )}
      </div>
      <div className="flex min-w-32 justify-end">
        {page < lastPage && (
          <Link href={hrefOf(page + 1)} className={buttonClass({ variant: "secondary" })}>
            前の {DAYS_PER_PAGE} 日 →
          </Link>
        )}
      </div>
    </nav>
  );
}
