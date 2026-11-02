import Link from "next/link";
import { buttonClass } from "@/components/button";
import { exerciseIntensityLabel, exerciseKcal, exerciseTypeLabel } from "@/lib/exercise";
import { EXERCISE_MAX_PER_DAY } from "@/lib/exercise-limits";
import { listExercisesOfDay } from "@/lib/exercises";
import { getProfile } from "@/lib/profiles";

// 日の詳細に出す、その日の運動の一覧(追加した順)と、増えた消費の合計、「運動を追加」。行のどこでも、直す画面へ移動する。
// 消費カロリーは保存せず、その日の朝の体重(呼び出し側が渡す。無ければプロフィールの体重)から、表示のたびに計算する
export async function ExerciseList({ date, morningWeightKg }: { date: string; morningWeightKg: string | null }) {
  const [exercises, profile] = await Promise.all([listExercisesOfDay(date), getProfile()]);
  const weight = morningWeightKg ?? profile.currentWeightKg;
  const weightKg = weight === null ? null : Number(weight);

  const rows = exercises.map((exercise) => ({ exercise, kcal: exerciseKcal(exercise.type, exercise.intensity, exercise.minutes, weightKg) }));
  const totalKcal = rows.reduce((total, row) => total + (row.kcal ?? 0), 0);
  const hasUncalculated = rows.some((row) => row.kcal === null);

  return (
    <section aria-label="運動" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">追加の運動</h2>
        {exercises.length >= EXERCISE_MAX_PER_DAY ? (
          <p className="text-sm text-zinc-500">1 日に記録できるのは {EXERCISE_MAX_PER_DAY} 件までです</p>
        ) : (
          <Link href={`/days/${date}/exercises/new`} className={buttonClass()}>
            運動を追加
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">いつもより多く動いた分は、まだ記録されていません。</p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            {rows.map(({ exercise, kcal }) => (
              // 種類名のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
              <li key={exercise.id} className="relative flex items-center gap-3 border-t border-zinc-100 px-4 py-2 text-sm first:border-t-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900">
                <Link href={`/days/${date}/exercises/${exercise.id}/edit`} className="font-medium after:absolute after:inset-0">
                  {exerciseTypeLabel(exercise.type)}
                </Link>
                <span className="text-zinc-500">{exerciseIntensityLabel(exercise.intensity)}</span>
                <span className="tabular-nums text-zinc-500">{exercise.minutes} 分</span>
                <span className="min-w-0 flex-1 truncate text-zinc-500">{exercise.memo}</span>
                <span className="tabular-nums">{kcal === null ? "—" : `${kcal} kcal`}</span>
                <span aria-hidden className="text-zinc-400">
                  ›
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-zinc-500">
            運動で増えた消費: <span className="tabular-nums text-foreground">{totalKcal} kcal</span>(目安です)
            {hasUncalculated && " 体重が未入力のため、計算できない運動があります。朝の体重かプロフィールの体重を入れてください。"}
          </p>
        </>
      )}
    </section>
  );
}
