import Link from "next/link";
import { buttonClass } from "@/components/button";

// 日の詳細に出す、今日の気づきと、書く・直すリンク
export function ReflectionSection({ date, reflection }: { date: string; reflection: string | null }) {
  return (
    <section aria-label="今日の気づき" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">今日の気づき</h2>
        <Link href={`/days/${date}/reflection`} className={buttonClass()}>
          {reflection === null ? "書く" : "編集"}
        </Link>
      </div>

      {reflection === null ? (
        <p className="text-sm text-ink-muted">今日の気づきは、まだ書かれていません。</p>
      ) : (
        // 改行をそのまま見せる
        <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-raised px-4 py-3 text-[15px]">{reflection}</p>
      )}
    </section>
  );
}
