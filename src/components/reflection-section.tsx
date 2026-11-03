import Link from "next/link";
import { buttonClass } from "@/components/button";

// 日の詳細に出す、夜の振り返りと、書く・直すリンク
export function ReflectionSection({ date, reflection }: { date: string; reflection: string | null }) {
  return (
    <section aria-label="夜の振り返り" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">夜の振り返り</h2>
        <Link href={`/days/${date}/reflection`} className={buttonClass()}>
          {reflection === null ? "書く" : "編集"}
        </Link>
      </div>

      {reflection === null ? (
        <p className="text-sm text-zinc-500">夜の振り返りは、まだ書かれていません。</p>
      ) : (
        // 改行をそのまま見せる
        <p className="whitespace-pre-wrap break-words text-sm">{reflection}</p>
      )}
    </section>
  );
}
