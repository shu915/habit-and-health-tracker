import "server-only";
import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { days, exercises } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { insertDayIfMissing } from "@/lib/day-row";
import { isValidDateString } from "@/lib/date";
import { EXERCISE_MAX_PER_DAY, isExerciseId } from "@/lib/exercise-limits";
import type { ExerciseValues } from "@/lib/exercise-schema";

// 運動(1 回 = 1 行)の読み書き。meals.ts と同じ決まり: どの関数も、最初に getCurrentUserId() でログイン中のユーザーを確かめ、
// 必ずその user_id で絞る(他のユーザーの運動が見えない・書き換えられないことが最重要)。
// 運動は days の行に紐づく(複合外部キー (user_id, day_id) で、他のユーザーの日には紐づけられない)。
// 日付(YYYY-MM-DD)は、この中でも検証する。呼び出し側が先に検証する想定で、ここで落ちるのは呼び出し側の見落とし

function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

export type Exercise = typeof exercises.$inferSelect;

// その日の運動が、上限(EXERCISE_MAX_PER_DAY)に達していて、足せないとき
export class ExerciseLimitError extends Error {
  constructor() {
    super(`1 日に記録できる運動は ${EXERCISE_MAX_PER_DAY} 件までです。`);
    this.name = "ExerciseLimitError";
  }
}

// 運動を追加する。その日の days の行が無ければ、空で作る(あれば、そのまま使う)。値の検証は呼び出し側(Server Action)が済ませてから渡す。
// その日がすでに上限(EXERCISE_MAX_PER_DAY 件)なら ExerciseLimitError を投げる。
// 「数える → 足す」の間に、同時に届いた要求がすり抜けないよう、その日の行をロックして(FOR UPDATE)直列にする
export async function saveExercise(date: string, input: ExerciseValues): Promise<Exercise> {
  const userId = await getCurrentUserId();
  assertValidDate(date);

  return db.transaction(async (tx) => {
    await insertDayIfMissing(tx, userId, date);
    const [day] = await tx
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.userId, userId), eq(days.date, date)))
      .limit(1)
      .for("update");
    if (!day) throw new Error("days の行を作れませんでした");

    const [{ n }] = await tx
      .select({ n: count() })
      .from(exercises)
      .where(and(eq(exercises.userId, userId), eq(exercises.dayId, day.id)));
    if (n >= EXERCISE_MAX_PER_DAY) throw new ExerciseLimitError();

    const [row] = await tx
      .insert(exercises)
      .values({ type: input.type, intensity: input.intensity, minutes: input.minutes, startTime: input.startTime, memo: input.memo, userId, dayId: day.id })
      .returning();
    return row;
  });
}

// その日の運動(開始時刻の早い順。時刻なしは最後で、同じなら追加した順)。日の行が無ければ空
export async function listExercisesOfDay(date: string): Promise<Exercise[]> {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const rows = await db
    .select({ exercise: exercises })
    .from(exercises)
    .innerJoin(days, and(eq(exercises.dayId, days.id), eq(exercises.userId, days.userId)))
    .where(and(eq(exercises.userId, userId), eq(days.userId, userId), eq(days.date, date)))
    .orderBy(asc(exercises.startTime), asc(exercises.id)); // 昇順は NULL が最後
  return rows.map((row) => row.exercise);
}

// from〜to(両端を含む)の運動の、日付・種類・強さ・時間だけ(消費の計算用。メモは読まない)。古い日から、同じ日は追加した順。推移のグラフ用
export async function listExercisesInRange(from: string, to: string): Promise<{ date: string; type: string; intensity: string; minutes: number }[]> {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);
  return db
    .select({ date: days.date, type: exercises.type, intensity: exercises.intensity, minutes: exercises.minutes })
    .from(exercises)
    .innerJoin(days, and(eq(exercises.dayId, days.id), eq(exercises.userId, days.userId)))
    .where(and(eq(exercises.userId, userId), eq(days.userId, userId), gte(days.date, from), lte(days.date, to)))
    .orderBy(asc(days.date), asc(exercises.id));
}

// 1 件(自分の運動だけ)。無い・他のユーザーのものは null
export async function getExercise(id: number): Promise<{ exercise: Exercise; date: string } | null> {
  const userId = await getCurrentUserId();
  if (!isExerciseId(id)) return null; // 範囲外の数は、DB に渡さない(エラーになるので)
  const [row] = await db
    .select({ exercise: exercises, date: days.date })
    .from(exercises)
    .innerJoin(days, and(eq(exercises.dayId, days.id), eq(exercises.userId, days.userId)))
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .limit(1);
  return row ?? null;
}

// 運動を直す(自分の運動だけ。日は変えない)。無い・他のユーザーのものは null
export async function updateExercise(id: number, input: ExerciseValues): Promise<Exercise | null> {
  const userId = await getCurrentUserId();
  if (!isExerciseId(id)) return null;
  const [row] = await db
    .update(exercises)
    .set({ type: input.type, intensity: input.intensity, minutes: input.minutes, startTime: input.startTime, memo: input.memo, updatedAt: new Date() })
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning();
  return row ?? null;
}

// 運動を消す(自分の運動だけ)。消せたら true
export async function deleteExercise(id: number): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!isExerciseId(id)) return false;
  const rows = await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning({ id: exercises.id });
  return rows.length > 0;
}
