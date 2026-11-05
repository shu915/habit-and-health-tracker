import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gte, lte, max, sum } from "drizzle-orm";
import { db } from "@/db";
import { days, meals } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { insertDayIfMissing } from "@/lib/day-row";
import { isValidDateString } from "@/lib/date";
import { estimatedItemSchema, type EstimatedItem } from "@/lib/meal-estimate-schema";
import type { MealTotals } from "@/lib/meal-estimate";
import { isMealId } from "@/lib/meal-limits";
import { z } from "zod";

// 食事(1 食 = 1 行)の読み書き。どの関数も、最初に getCurrentUserId() でログイン中のユーザーを確かめ、
// 必ずその user_id で絞る(他のユーザーの食事が見えない・書き換えられないことが最重要)。
// 食事は days の行に紐づく(複合外部キー (user_id, day_id) で、他のユーザーの日には紐づけられない)。
// 日付(YYYY-MM-DD)は、この中でも検証する。呼び出し側が先に検証する想定で、ここで落ちるのは呼び出し側の見落とし

function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

// 保存する食事。値の検証(形・範囲)は、呼び出し側(Server Action)が zod で済ませてから渡す。DB の CHECK が最後の砦
export type MealInput = {
  eatenTime: string; // "HH:MM"(00:00〜26:59)
  dishName: string;
  description: string;
  items: EstimatedItem[];
  totals: MealTotals;
};

// 読み出した食事。内訳(items)は jsonb なので、読むときも検証し直す(形が合わなければ空にして、itemsValid を false にする)
export type Meal = Omit<typeof meals.$inferSelect, "items"> & { items: EstimatedItem[]; itemsValid: boolean };

const itemsSchema = z.array(estimatedItemSchema);

function toMeal(row: typeof meals.$inferSelect): Meal {
  const parsed = itemsSchema.safeParse(row.items);
  return { ...row, items: parsed.success ? parsed.data : [], itemsValid: parsed.success };
}

// 合計(数値)を、列の形(numeric は文字列、kcal は整数)にする
function columnsOf(input: MealInput) {
  const { totals } = input;
  return {
    eatenTime: input.eatenTime,
    dishName: input.dishName,
    description: input.description,
    kcal: totals.kcal,
    proteinG: totals.proteinG.toFixed(1),
    fatG: totals.fatG.toFixed(1),
    netCarbG: totals.netCarbG.toFixed(1),
    fiberG: totals.fiberG === null ? null : totals.fiberG.toFixed(1),
    saltG: totals.saltG === null ? null : totals.saltG.toFixed(1),
    items: input.items,
  };
}

// 食事を追加する。その日の days の行が無ければ、空で作る(あれば、そのまま使う)
export async function saveMeal(date: string, input: MealInput): Promise<Meal> {
  const userId = await getCurrentUserId();
  assertValidDate(date);

  return db.transaction(async (tx) => {
    await insertDayIfMissing(tx, userId, date);
    const [day] = await tx
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.userId, userId), eq(days.date, date)))
      .limit(1);
    if (!day) throw new Error("days の行を作れませんでした");

    const [row] = await tx
      .insert(meals)
      .values({ ...columnsOf(input), userId, dayId: day.id })
      .returning();
    return toMeal(row);
  });
}

// その日の食事(食べた時刻の順)。日の行が無ければ空
// 日の詳細は、食事の一覧と栄養の比べが別の部品で同じ日を読むので、1 回のリクエストの中では結果を使い回す(cache。getDayBasis と同じ)
export const listMealsOfDay = cache(async (date: string): Promise<Meal[]> => {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const rows = await db
    .select({ meal: meals })
    .from(meals)
    .innerJoin(days, and(eq(meals.dayId, days.id), eq(meals.userId, days.userId)))
    .where(and(eq(meals.userId, userId), eq(days.userId, userId), eq(days.date, date)))
    .orderBy(asc(meals.eatenTime), asc(meals.id));
  return rows.map((row) => toMeal(row.meal));
});

// 1 件(自分の食事だけ)。無い・他のユーザーのものは null
export async function getMeal(id: number): Promise<{ meal: Meal; date: string } | null> {
  const userId = await getCurrentUserId();
  if (!isMealId(id)) return null; // 範囲外の数は、DB に渡さない(エラーになるので)
  const [row] = await db
    .select({ meal: meals, date: days.date })
    .from(meals)
    .innerJoin(days, and(eq(meals.dayId, days.id), eq(meals.userId, days.userId)))
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .limit(1);
  return row ? { meal: toMeal(row.meal), date: row.date } : null;
}

// from〜to(両端を含む)の、日ごとの摂取カロリー(その日の食事の kcal の合計)と食事の回数。食事のある日だけ(無い日は行を返さない)。古い順。推移のグラフ・レポート用
// (食事が 1 回だけの日は、記録が不完全な可能性があるので、バッジの判定から外すために、回数も返す)
export async function listDailyIntake(from: string, to: string): Promise<{ date: string; kcal: number; mealCount: number }[]> {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);
  const rows = await db
    .select({ date: days.date, kcal: sum(meals.kcal), mealCount: count() })
    .from(meals)
    .innerJoin(days, and(eq(meals.dayId, days.id), eq(meals.userId, days.userId)))
    .where(and(eq(meals.userId, userId), eq(days.userId, userId), gte(days.date, from), lte(days.date, to)))
    .groupBy(days.date)
    .orderBy(asc(days.date));
  return rows.map((row) => ({ date: row.date, kcal: Number(row.kcal), mealCount: row.mealCount }));
}

// 食事を直す(自分の食事だけ。日は変えない)。無い・他のユーザーのものは null
export async function updateMeal(id: number, input: MealInput): Promise<Meal | null> {
  const userId = await getCurrentUserId();
  if (!isMealId(id)) return null;
  const [row] = await db
    .update(meals)
    .set({ ...columnsOf(input), updatedAt: new Date() })
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .returning();
  return row ? toMeal(row) : null;
}

// 食事を消す(自分の食事だけ)。消せたら true
export async function deleteMeal(id: number): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!isMealId(id)) return false;
  const rows = await db
    .delete(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .returning({ id: meals.id });
  return rows.length > 0;
}

// AI に渡す、過去の料理名(dish_name)。最近使った順に、重複なしで limit 件
export async function listRecentDishNames(limit = 100): Promise<string[]> {
  const userId = await getCurrentUserId();
  const rows = await db
    .select({ name: meals.dishName, lastUsed: max(meals.createdAt) })
    .from(meals)
    .where(eq(meals.userId, userId))
    .groupBy(meals.dishName)
    .orderBy(desc(max(meals.createdAt)))
    .limit(limit);
  return rows.map((row) => row.name);
}
