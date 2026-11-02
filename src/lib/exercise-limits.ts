import type { Bound } from "@/lib/profile-limits";
import { MAX_ID } from "@/lib/meal-limits";

// 運動の値の範囲。profile-limits.ts、day-limits.ts、meal-limits.ts と同じ決まり:
//   app: 現実的な範囲(zod とフォームが使う) / db: DB の CHECK 制約が止める広い範囲。app は db の内側にあること
export type ExerciseLimitedField = "minutes";

type Limit = { scale: number; app: Bound; db: Bound };

export const EXERCISE_LIMITS: Record<ExerciseLimitedField, Limit> = {
  // 1 回の運動の時間(分)。app は 10 時間まで、db は 1 日(1440 分)まで
  minutes: { scale: 0, app: { min: 1, max: 600 }, db: { min: 1, max: 1440 } },
};

// 1 日に記録できる運動の件数の上限(1 人のユーザーが、自分の日の詳細を重くしないための歯止め)
export const EXERCISE_MAX_PER_DAY = 5;

// メモ(任意。AI には送らない)の文字数の上限(列の長さと同じ)
export const EXERCISE_MEMO_MAX_LENGTH = 200;

// 運動の id(PostgreSQL の serial = int4)として、ありうる値か。範囲外の数を DB に渡すとエラー(500)になるので、手前で弾いて 404 にする
export function isExerciseId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= MAX_ID;
}

// フォームに出す範囲の文字列("1〜600")
export function formatExerciseRange(field: ExerciseLimitedField): string {
  const { min, max } = EXERCISE_LIMITS[field].app;
  return `${min}〜${max}`;
}
