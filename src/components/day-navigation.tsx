import Link from "next/link";

// 別の日に移る: 前の記録の日・次の記録の日(記録のある日だけを行き来する。無ければ、そのリンクは出さない)。
// 記録の無い日を新しく作るのは、ダッシュボードの日付欄から。previous / next は getAdjacentDays(lib/days.ts)の結果。
// hrefOf は、移り先の日付から URL を作る(詳細は /days/[date]、編集は /days/[date]/edit)
export function DayNavigation({ previous, next, hrefOf }: { previous: string | null; next: string | null; hrefOf: (date: string) => string }) {
  const linkClass = "text-sm text-zinc-500 hover:underline";

  return (
    <nav aria-label="別の日に移る" className="mt-1 flex gap-4">
      {previous !== null && (
        <Link href={hrefOf(previous)} className={linkClass}>
          ← 前の日
        </Link>
      )}
      {next !== null && (
        <Link href={hrefOf(next)} className={linkClass}>
          次の日 →
        </Link>
      )}
    </nav>
  );
}
