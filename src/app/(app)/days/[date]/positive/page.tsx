import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { EMPTY_POSITIVE, PositiveForm, type PositiveFormInitial } from "@/components/positive-form";
import { isRecordableDate } from "@/lib/date";
import { listPositiveEntriesOfDay } from "@/lib/positive-entries";
import { savePositiveAction } from "./actions";

// 「良かったこと」(ポジティブ3行日記)の編集。保存は positive/actions.ts
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function PositivePage({ params }: PageProps<"/days/[date]/positive">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <PositiveContent params={params} />
    </Suspense>
  );
}

async function PositiveContent({ params }: Pick<PageProps<"/days/[date]/positive">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();

  const entries = await listPositiveEntriesOfDay(date);
  const initial: PositiveFormInitial = { ...EMPTY_POSITIVE };
  entries.forEach((entry, index) => {
    const n = index + 1;
    if (n === 1 || n === 2 || n === 3) initial[`body${n}`] = entry.body;
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の良かったこと</h1>
      </div>
      <PositiveForm date={date} initial={initial} action={savePositiveAction.bind(null, date)} />
    </div>
  );
}
