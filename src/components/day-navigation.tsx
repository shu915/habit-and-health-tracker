import Link from "next/link";
import { isRecordableDate, shiftDate } from "@/lib/date";

// 別の日に移る: 前の日・次の日(翌日より先は記録できないので出さない)。離れた日はダッシュボードで日付を選ぶ。
// hrefOf は、移り先の日付から URL を作る(詳細は /days/[date]、編集は /days/[date]/edit)
export function DayNavigation({ date, hrefOf }: { date: string; hrefOf: (date: string) => string }) {
  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const linkClass = "text-sm text-zinc-500 hover:underline";

  return (
    <nav aria-label="別の日に移る" className="mt-1 flex gap-4">
      {isRecordableDate(previous) && (
        <Link href={hrefOf(previous)} className={linkClass}>
          ← 前の日
        </Link>
      )}
      {isRecordableDate(next) && (
        <Link href={hrefOf(next)} className={linkClass}>
          次の日 →
        </Link>
      )}
    </nav>
  );
}
