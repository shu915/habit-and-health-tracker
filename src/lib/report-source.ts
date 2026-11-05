import "server-only";
import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { days, exercises, meals, positiveEntries } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString } from "@/lib/date";
import type { ReportSource } from "@/lib/report-input";

// レポートの AI に渡す、文章を含む記録(食事の名前・運動のメモ・良かったこと・今日の気づき)を、期間ぶんまとめて 1 回ずつ取る。
// ログイン中のユーザーの分だけ(全部 user_id で絞る)。**ここで取った文章は、AI への入力にだけ使い、レポートのスナップショットには入れない**
// (あとで日記を消しても、レポートに残らないように。docs/ai-feedback.md)。呼ぶのは、利用者が同意して「作る」を押したときだけ
function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

export async function loadReportSource(from: string, to: string): Promise<ReportSource> {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);
  const inRange = and(eq(days.userId, userId), gte(days.date, from), lte(days.date, to));

  const [mealRows, exerciseRows, positiveRows, reflectionRows] = await Promise.all([
    db
      .select({ date: days.date, time: meals.eatenTime, dishName: meals.dishName, kcal: meals.kcal, proteinG: meals.proteinG, fatG: meals.fatG, carbG: meals.netCarbG, fiberG: meals.fiberG, saltG: meals.saltG })
      .from(meals)
      .innerJoin(days, and(eq(meals.dayId, days.id), eq(meals.userId, days.userId)))
      .where(and(inRange, eq(meals.userId, userId)))
      .orderBy(asc(days.date), asc(meals.eatenTime), asc(meals.id)),
    db
      .select({ date: days.date, type: exercises.type, intensity: exercises.intensity, minutes: exercises.minutes, startTime: exercises.startTime, memo: exercises.memo })
      .from(exercises)
      .innerJoin(days, and(eq(exercises.dayId, days.id), eq(exercises.userId, days.userId)))
      .where(and(inRange, eq(exercises.userId, userId)))
      .orderBy(asc(days.date), asc(exercises.id)),
    db
      .select({ date: days.date, body: positiveEntries.body })
      .from(positiveEntries)
      .innerJoin(days, and(eq(positiveEntries.dayId, days.id), eq(positiveEntries.userId, days.userId)))
      .where(and(inRange, eq(positiveEntries.userId, userId)))
      .orderBy(asc(days.date), asc(positiveEntries.position)),
    db
      .select({ date: days.date, text: days.reflection })
      .from(days)
      .where(and(inRange, isNotNull(days.reflection), sql`btrim(${days.reflection}) <> ''`))
      .orderBy(asc(days.date)),
  ]);

  return {
    meals: mealRows.map((m) => ({ date: m.date, time: m.time, name: m.dishName, kcal: m.kcal, proteinG: Number(m.proteinG), fatG: Number(m.fatG), carbG: Number(m.carbG), fiberG: m.fiberG === null ? null : Number(m.fiberG), saltG: m.saltG === null ? null : Number(m.saltG) })),
    exercises: exerciseRows,
    positives: positiveRows,
    reflections: reflectionRows.flatMap((r) => (r.text === null ? [] : [{ date: r.date, text: r.text }])),
  };
}
