import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { days, positiveEntries } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { insertDayIfMissing } from "@/lib/day-row";
import { isValidDateString } from "@/lib/date";
import { POSITIVE_MAX_PER_DAY } from "@/lib/positive-limits";

// ポジティブ3行日記(良かったこと)の読み書き。meals.ts、exercises.ts と同じ決まり: どの関数も、最初に getCurrentUserId() で
// ログイン中のユーザーを確かめ、必ずその user_id で絞る。日付(YYYY-MM-DD)は、この中でも検証する

function assertValidDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

export type PositiveEntry = typeof positiveEntries.$inferSelect;

// その日の「良かったこと」を、まとめて入れ替える(bodies は書いた順で、最大 POSITIVE_MAX_PER_DAY 件。空なら、その日の分をすべて消す)。
// その日の days の行が無ければ、(1 件以上あるときだけ)空で作る。値の検証は呼び出し側(Server Action)が済ませてから渡す。
// 「消す → 入れる」の間に、同時に届いた保存が割り込んで一意制約(day_id, position)に当たらないよう、日の行を FOR UPDATE でロックして直列にする(最後の保存が勝つ)
export async function savePositiveEntries(date: string, bodies: string[]): Promise<void> {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  if (bodies.length > POSITIVE_MAX_PER_DAY) throw new Error(`too many entries: ${bodies.length}`);

  await db.transaction(async (tx) => {
    if (bodies.length > 0) await insertDayIfMissing(tx, userId, date);
    const [day] = await tx
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.userId, userId), eq(days.date, date)))
      .limit(1)
      .for("update");
    if (!day) return; // 日の行が無く、書くものも無い: 消すものが無い

    await tx.delete(positiveEntries).where(and(eq(positiveEntries.userId, userId), eq(positiveEntries.dayId, day.id)));
    if (bodies.length === 0) return;
    await tx.insert(positiveEntries).values(bodies.map((body, index) => ({ userId, dayId: day.id, position: index + 1, body })));
  });
}

// その日の「良かったこと」(書いた順)。日の行が無ければ空
export async function listPositiveEntriesOfDay(date: string): Promise<PositiveEntry[]> {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const rows = await db
    .select({ entry: positiveEntries })
    .from(positiveEntries)
    .innerJoin(days, and(eq(positiveEntries.dayId, days.id), eq(positiveEntries.userId, days.userId)))
    .where(and(eq(positiveEntries.userId, userId), eq(days.userId, userId), eq(days.date, date)))
    .orderBy(asc(positiveEntries.position));
  return rows.map((row) => row.entry);
}
