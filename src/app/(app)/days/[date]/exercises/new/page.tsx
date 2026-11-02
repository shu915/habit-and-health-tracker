import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { EMPTY_EXERCISE, ExerciseForm } from "@/components/exercise-form";
import { isRecordableDate } from "@/lib/date";
import { saveExerciseAction } from "../actions";

// 運動の追加(いつもより多く動いた分)。保存は exercises/actions.ts
// params は Suspense の内側で読む(cacheComponents で静的シェルを残すため)
export default function NewExercisePage({ params }: PageProps<"/days/[date]/exercises/new">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <NewExerciseContent params={params} />
    </Suspense>
  );
}

async function NewExerciseContent({ params }: Pick<PageProps<"/days/[date]/exercises/new">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の運動を追加</h1>
      </div>
      <ExerciseForm date={date} initial={EMPTY_EXERCISE} action={saveExerciseAction.bind(null, date)} />
    </div>
  );
}
