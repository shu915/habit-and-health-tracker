import Link from "next/link";
import { buttonClass } from "@/components/button";
import { ExerciseBadge } from "@/components/exercise-badge";
import { exerciseIntensityLabel, exerciseKcal, exerciseTypeLabel } from "@/lib/exercise";
import { EXERCISE_MAX_PER_DAY } from "@/lib/exercise-limits";
import { listExercisesOfDay } from "@/lib/exercises";
import { getDayWeight } from "@/lib/days";

// 日の詳細に出す、その日の運動の一覧(開始時刻の早い順。時刻なしは最後)と、増えた消費の合計、「運動を追加」。行のどこでも、直す画面へ移動する。
// 消費カロリーは保存せず、その日の体重(朝の体重 → それ以前の最新 → プロフィールの体重。day-weight.ts)から、表示のたびに計算する
export async function ExerciseList({ date }: { date: string }) {
  const [exercises, weight] = await Promise.all([listExercisesOfDay(date), getDayWeight(date)]);
  const weightKg = weight.kg;

  const rows = exercises.map((exercise) => ({ exercise, kcal: exerciseKcal(exercise.type, exercise.intensity, exercise.minutes, weightKg) }));
  const totalKcal = rows.reduce((total, row) => total + (row.kcal ?? 0), 0);
  const hasUncalculated = rows.some((row) => row.kcal === null);

  return (
    <section aria-label="運動" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">追加の運動</h2>
        {exercises.length >= EXERCISE_MAX_PER_DAY ? (
          <p className="text-sm text-ink-muted">1 日に記録できるのは {EXERCISE_MAX_PER_DAY} 件までです</p>
        ) : (
          <Link href={`/days/${date}/exercises/new`} className={buttonClass()}>
            運動を追加
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">いつもより多く動いた分は、まだ記録されていません。</p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg bg-surface-raised">
            {rows.map(({ exercise, kcal }) => (
              // 種類名のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
              <li key={exercise.id} className="relative flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line-soft px-5 py-3.5 text-[15px] first:border-t-0 hover:bg-surface-hover sm:flex-nowrap">
                {/* 並びは食事(meal-list.tsx)と同じ: バッジ → 時刻 → 名前。幅を固定して、時刻が空でも縦にそろえる */}
                <span className="w-14 shrink-0">
                  <ExerciseBadge time={exercise.startTime} />
                </span>
                <span className="w-11 shrink-0 tabular-nums text-ink-muted">{exercise.startTime ?? ""}</span>
                {/* 狭い画面では 2 行目(種類・強さ・分)と 3 行目(メモ)にまとめる。広い画面では、枠を無くして 1 行に並べる(sm:contents) */}
                <div className="order-last flex w-full flex-wrap items-center gap-x-3.5 gap-y-1 sm:order-none sm:contents">
                  <Link href={`/days/${date}/exercises/${exercise.id}/edit`} className="font-medium after:absolute after:inset-0">
                    {exerciseTypeLabel(exercise.type)}
                  </Link>
                  <span className="text-ink-muted">{exerciseIntensityLabel(exercise.intensity)}</span>
                  <span className="tabular-nums text-ink-muted">{exercise.minutes} 分</span>
                  <span className="w-full min-w-0 truncate text-ink-muted empty:hidden sm:w-auto sm:flex-1 sm:empty:block">{exercise.memo}</span>
                </div>
                <span className="ml-auto tabular-nums sm:ml-0">{kcal === null ? "—" : `${kcal} kcal`}</span>
                <span aria-hidden className="text-ink-decor">
                  ›
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            運動で増えた消費: <span className="font-semibold tabular-nums text-foreground">{totalKcal} kcal</span>(目安です)
            {hasUncalculated && " 体重が未入力のため、計算できない運動があります。朝の体重かプロフィールの体重を入れてください。"}
          </p>
        </>
      )}
    </section>
  );
}
