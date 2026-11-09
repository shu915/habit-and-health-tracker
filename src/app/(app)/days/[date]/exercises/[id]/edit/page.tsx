import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { ExerciseForm } from "@/components/exercise-form";
import { isRecordableDate } from "@/lib/date";
import { isExerciseId } from "@/lib/exercise-limits";
import { getExercise } from "@/lib/exercises";
import { deleteExerciseAction, updateExerciseAction } from "../../actions";

// 運動を直す・消す。保存した内容から始める
export default function EditExercisePage({ params }: PageProps<"/days/[date]/exercises/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
      <EditExerciseContent params={params} />
    </Suspense>
  );
}

async function EditExerciseContent({ params }: Pick<PageProps<"/days/[date]/exercises/[id]/edit">, "params">) {
  const { date, id } = await params;
  await connection();
  const exerciseId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!isRecordableDate(date) || !isExerciseId(exerciseId)) notFound();

  const found = await getExercise(exerciseId); // 自分の運動だけ取れる
  if (!found || found.date !== date) notFound();
  const { exercise } = found;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{date} の運動の編集</h1>
      </div>
      <ExerciseForm
        date={date}
        initial={{ type: exercise.type, intensity: exercise.intensity, minutes: String(exercise.minutes), startTime: exercise.startTime ?? "", memo: exercise.memo ?? "" }}
        action={updateExerciseAction.bind(null, exercise.id)}
        deleteAction={deleteExerciseAction.bind(null, exercise.id)}
      />
    </div>
  );
}
