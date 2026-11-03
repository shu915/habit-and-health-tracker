import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { days } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString } from "@/lib/date";
import { DAY_FIELDS, type DayValues } from "@/lib/day-schema";

// 1 日の記録の読み書き。どの関数も、最初に getCurrentUserId() でログイン中のユーザーを確かめ、
// 必ずその user_id で絞る(他のユーザーの記録が見えないことが最重要)。
// 日付(YYYY-MM-DD)は、この中でも検証する。呼び出し側が先に検証して 404 などにする想定で、
// ここで落ちるのは呼び出し側の見落とし(プログラムの誤り)

function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

// from〜to(両端を含む)の記録のある日を、新しい順に返す。一覧は期間で区切って取るので、全件は取らない
export async function listDaysInRange(from: string, to: string) {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);
  return db
    .select()
    .from(days)
    .where(and(eq(days.userId, userId), gte(days.date, from), lte(days.date, to)))
    .orderBy(desc(days.date));
}

// いちばん古い記録の日(記録が無ければ null)。一覧のページの端を決めるのに使う
export async function getFirstDayDate(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const [row] = await db.select({ date: days.date }).from(days).where(eq(days.userId, userId)).orderBy(asc(days.date)).limit(1);
  return row?.date ?? null;
}

export async function getDay(date: string) {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const [row] = await db
    .select()
    .from(days)
    .where(and(eq(days.userId, userId), eq(days.date, date)))
    .limit(1);
  return row ?? null;
}

// その日が無ければ作り、あれば上書きする(同じ日を二重に作らない)。
// input にある項目だけを書く(キーが無い項目は変更しない)。user_id と date は入力で上書きできない
export async function saveDay(date: string, input: Partial<DayValues>) {
  const userId = await getCurrentUserId();
  assertValidDate(date);

  // 既知の項目だけを取り出す(user_id などの余計なキーは、ここで落とす)
  const changes: Partial<DayValues> = {};
  for (const field of DAY_FIELDS) {
    if (input[field] !== undefined) Object.assign(changes, { [field]: input[field] });
  }

  const [row] = await db
    .insert(days)
    .values({ ...changes, userId, date })
    .onConflictDoUpdate({
      target: [days.userId, days.date],
      set: { ...changes, updatedAt: new Date() },
    })
    .returning();
  return row;
}
