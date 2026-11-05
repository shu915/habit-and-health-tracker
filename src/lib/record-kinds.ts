import "server-only";
import { and, eq, gte, isNotNull, lte, min, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { days, exercises, meals, positiveEntries } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString } from "@/lib/date";
import type { RecordKind } from "@/lib/record-calendar";

function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

// 記録のある、いちばん古い日(その人の days の行の、いちばん古い日。無ければ null)。月次レポートで選べる月の下限に使う
export async function getEarliestRecordedDate(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const [row] = await db.select({ date: min(days.date) }).from(days).where(eq(days.userId, userId));
  return row?.date ?? null;
}

// 期間(from〜to)の、日ごとの「記録した種類」(記録のカレンダーの元)。ログイン中のユーザーの分だけ。
// 日記の本文などは読まない(今日の気づきは、空でないかだけを DB 側で判定する)。4 つの表を、日ごとではなく期間ぶんまとめて 1 回ずつ取る
export async function listRecordKinds(from: string, to: string): Promise<Map<string, RecordKind[]>> {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);

  const inRange = and(eq(days.userId, userId), gte(days.date, from), lte(days.date, to));
  const [dayRows, mealDates, exerciseDates, positiveDates] = await Promise.all([
    db
      .select({
        date: days.date,
        morning: sql<boolean>`(${days.morningWeightKg} IS NOT NULL OR ${days.morningBodyFatPercent} IS NOT NULL OR ${days.sleepBedtime} IS NOT NULL OR ${days.sleepWakeTime} IS NOT NULL)`,
        reflection: sql<boolean>`(coalesce(btrim(${days.reflection}), '') <> '')`,
      })
      .from(days)
      .where(and(inRange, or(isNotNull(days.morningWeightKg), isNotNull(days.morningBodyFatPercent), isNotNull(days.sleepBedtime), isNotNull(days.sleepWakeTime), isNotNull(days.reflection)))),
    db
      .selectDistinct({ date: days.date })
      .from(meals)
      .innerJoin(days, and(eq(meals.dayId, days.id), eq(meals.userId, days.userId)))
      .where(and(inRange, eq(meals.userId, userId))),
    db
      .selectDistinct({ date: days.date })
      .from(exercises)
      .innerJoin(days, and(eq(exercises.dayId, days.id), eq(exercises.userId, days.userId)))
      .where(and(inRange, eq(exercises.userId, userId))),
    db
      .selectDistinct({ date: days.date })
      .from(positiveEntries)
      .innerJoin(days, and(eq(positiveEntries.dayId, days.id), eq(positiveEntries.userId, days.userId)))
      .where(and(inRange, eq(positiveEntries.userId, userId))),
  ]);

  const result = new Map<string, RecordKind[]>();
  const add = (date: string, kind: RecordKind) => result.set(date, [...(result.get(date) ?? []), kind]);
  for (const row of dayRows) {
    if (row.morning) add(row.date, "morning");
    if (row.reflection) add(row.date, "reflection");
  }
  for (const { date } of mealDates) add(date, "meal");
  for (const { date } of exerciseDates) add(date, "exercise");
  for (const { date } of positiveDates) add(date, "positive");
  return result;
}
