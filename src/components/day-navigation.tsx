import Link from "next/link";

// 別の日に移る: 前の記録の日・次の記録の日(記録のある日だけを行き来する)。
// 連打することが多いので、行き先が無いときも消さず、押せない表示のまま同じ場所に残す(「次の日」の位置が動かない)。
// 記録の無い日を新しく作るのは、ダッシュボードの日付欄から。previous / next は getAdjacentDays(lib/days.ts)の結果。
// hrefOf は、移り先の日付から URL を作る(詳細は /days/[date]、編集は /days/[date]/edit)
export function DayNavigation({ previous, next, hrefOf }: { previous: string | null; next: string | null; hrefOf: (date: string) => string }) {
  return (
    <nav aria-label="別の日に移る" className="mt-1 flex gap-4">
      <NavItem date={previous} hrefOf={hrefOf}>
        ← 前の日
      </NavItem>
      <NavItem date={next} hrefOf={hrefOf}>
        次の日 →
      </NavItem>
    </nav>
  );
}

function NavItem({ date, hrefOf, children }: { date: string | null; hrefOf: (date: string) => string; children: string }) {
  const base = "inline-flex min-h-11 items-center text-sm text-ink-muted"; // 連打するので、押す面は 44px 以上
  if (date === null) {
    // 押せない。薄くして、読み上げには「使えない」と伝える
    return (
      <span role="link" aria-disabled="true" className={`${base} cursor-not-allowed opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={hrefOf(date)} className={`${base} hover:underline`}>
      {children}
    </Link>
  );
}
