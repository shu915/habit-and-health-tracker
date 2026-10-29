import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidDateString } from "@/lib/date";

// 特定の日の詳細。デフォルトは閲覧モードで、?mode=edit で編集モードになる
// params / searchParams は Suspense の内側で読む(cacheComponents で静的シェルを残すため)
export default function DayPage({ params, searchParams }: PageProps<"/days/[date]">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <DayContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DayContent({
  params,
  searchParams,
}: Pick<PageProps<"/days/[date]">, "params" | "searchParams">) {
  const { date } = await params;
  if (!isValidDateString(date)) notFound();

  const { mode } = await searchParams;
  const isEditing = mode === "edit";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-semibold">{date}</h1>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Link
              href={`/days/${date}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              キャンセル
            </Link>
            <button
              type="button"
              disabled
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              保存(未実装)
            </button>
          </div>
        ) : (
          <Link
            href={`/days/${date}?mode=edit`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            編集
          </Link>
        )}
      </div>
      <p className="text-zinc-500">
        {isEditing ? "編集モード" : "閲覧モード"}: この日の記録の表示はこれから実装します。
      </p>
    </div>
  );
}
