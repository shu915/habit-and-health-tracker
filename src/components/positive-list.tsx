import Link from "next/link";
import { buttonClass } from "@/components/button";
import { listPositiveEntriesOfDay } from "@/lib/positive-entries";

// 日の詳細に出す、その日の「良かったこと」(ポジティブ3行日記)と、書く・直すリンク
export async function PositiveList({ date }: { date: string }) {
  const entries = await listPositiveEntriesOfDay(date);

  return (
    <section aria-label="良かったこと" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">良かったこと</h2>
        <Link href={`/days/${date}/positive`} className={buttonClass()}>
          {entries.length === 0 ? "書く" : "編集"}
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">今日の良かったことは、まだ書かれていません。</p>
      ) : (
        <ol className="overflow-hidden rounded-lg bg-surface-raised">
          {entries.map((entry) => (
            <li key={entry.id} className="whitespace-pre-wrap border-t border-line-soft px-5 py-3.5 text-[15px] first:border-t-0">
              {entry.body}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
