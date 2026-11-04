import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gt, gte, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import { days } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString, shiftDate } from "@/lib/date";
import { DAY_FIELDS, type DayValues } from "@/lib/day-schema";
import { DAYS_PER_PAGE } from "@/lib/day-pages";
import { insertDayIfMissing } from "@/lib/day-row";
import { pickMeasure, pickWeight, type DayWeight } from "@/lib/day-weight";
import { getProfile } from "@/lib/profiles";

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

// from〜to(両端を含む)の、日付と朝の体重・体脂肪率・睡眠の時刻・その日に固定した目標カロリーだけ(推移のグラフ用。日記の本文などの列は読まない)。古い順
export async function listDayMeasures(from: string, to: string) {
  const userId = await getCurrentUserId();
  assertValidDate(from);
  assertValidDate(to);
  return db
    .select({
      date: days.date,
      morningWeightKg: days.morningWeightKg,
      morningBodyFatPercent: days.morningBodyFatPercent,
      sleepBedtime: days.sleepBedtime,
      sleepWakeTime: days.sleepWakeTime,
      profileTargetCalories: days.profileTargetCalories,
    })
    .from(days)
    .where(and(eq(days.userId, userId), gte(days.date, from), lte(days.date, to)))
    .orderBy(asc(days.date));
}

// その日より前(その日は含まない)で、朝の体重が入っている、いちばん新しい日の体重(無ければ null)。期間の最初の日の体重を決めるのに使う(推移のグラフ用)
export async function getMorningWeightBefore(date: string): Promise<{ weight: string; date: string } | null> {
  await getCurrentUserId();
  assertValidDate(date);
  return latestMorningOnOrBefore(days.morningWeightKg, shiftDate(date, -1));
}

// その日より前(その日は含まない)で、固定した目標カロリーが入っている、いちばん新しい日の目標(無ければ null)。日の行が無い日の、目標の線を引き継ぐのに使う(推移のグラフ用)
export async function getStampedTargetBefore(date: string): Promise<number | null> {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const [row] = await db
    .select({ target: days.profileTargetCalories })
    .from(days)
    .where(and(eq(days.userId, userId), lt(days.date, date), isNotNull(days.profileTargetCalories)))
    .orderBy(desc(days.date))
    .limit(1);
  return row?.target ?? null;
}

// 記録のある日の数(一覧のページ数を決める)
export async function countDays(): Promise<number> {
  const userId = await getCurrentUserId();
  const [row] = await db.select({ total: count() }).from(days).where(eq(days.userId, userId));
  return row?.total ?? 0;
}

// その日の前後で、記録のある日(いちばん近い日)。前後の日への移動に使う。無ければ null。date 自身は含めない(記録があってもなくてもよい)
export async function getAdjacentDays(date: string): Promise<{ previous: string | null; next: string | null }> {
  const userId = await getCurrentUserId();
  assertValidDate(date);
  const [[before], [after]] = await Promise.all([
    db.select({ date: days.date }).from(days).where(and(eq(days.userId, userId), lt(days.date, date))).orderBy(desc(days.date)).limit(1),
    db.select({ date: days.date }).from(days).where(and(eq(days.userId, userId), gt(days.date, date))).orderBy(asc(days.date)).limit(1),
  ]);
  return { previous: before?.date ?? null, next: after?.date ?? null };
}

// 一覧の 1 ページ分(page は 1 から)。記録のある日を、新しい日から DAYS_PER_PAGE 件ずつ
export async function listDaysPage(page: number) {
  const userId = await getCurrentUserId();
  if (!Number.isInteger(page) || page < 1) throw new Error(`invalid page: ${page}`);
  return db
    .select()
    .from(days)
    .where(eq(days.userId, userId))
    .orderBy(desc(days.date))
    .limit(DAYS_PER_PAGE)
    .offset((page - 1) * DAYS_PER_PAGE);
}

// その日以前で、朝の値(体重か体脂肪率)が入っている、いちばん新しい日の値(無ければ null)
async function latestMorningOnOrBefore(column: typeof days.morningWeightKg | typeof days.morningBodyFatPercent, date: string): Promise<{ weight: string; date: string } | null> {
  const userId = await getCurrentUserId();
  const [row] = await db
    .select({ value: column, date: days.date })
    .from(days)
    .where(and(eq(days.userId, userId), lte(days.date, date), isNotNull(column)))
    .orderBy(desc(days.date))
    .limit(1);
  return row?.value == null ? null : { weight: row.value, date: row.date };
}

// その日の計算に使う体重(決め方は day-weight.ts)
export async function getDayWeight(date: string): Promise<DayWeight> {
  return (await getDayBasis(date)).weight;
}

// その日の計算(運動の消費・基礎代謝・栄養の目標との比べ)の土台。過ぎた日を、今のプロフィールで書き換えないための入口。
// - 体重・体脂肪率: その日の朝の値 → それ以前の最新の朝の値 → プロフィール(体重と体脂肪率はそれぞれ別に決める)
// - 目標カロリー・活動係数: その日が初めて保存されたときの写し(days の列)。写しが null なら今のプロフィールで補う
// profile は、これらをその日の値に差し替えたプロフィールの行(エネルギーの計算や栄養の比べに、そのまま渡せる)
export const getDayBasis = cache(async (date: string) => {
  await getCurrentUserId();
  assertValidDate(date);
  const [day, earlierWeight, earlierBodyFat, profile] = await Promise.all([
    getDay(date),
    latestMorningOnOrBefore(days.morningWeightKg, date),
    latestMorningOnOrBefore(days.morningBodyFatPercent, date),
    getProfile(),
  ]);
  const weight = pickWeight(day?.morningWeightKg ?? null, earlierWeight, profile.currentWeightKg);
  const bodyFat = pickMeasure(day?.morningBodyFatPercent ?? null, earlierBodyFat, profile.currentBodyFatPercent);
  return {
    weight,
    bodyFat,
    profile: {
      ...profile,
      currentWeightKg: weight.kg === null ? null : String(weight.kg),
      currentBodyFatPercent: bodyFat.value === null ? null : String(bodyFat.value),
      targetCalories: day?.profileTargetCalories ?? profile.targetCalories,
      activityLevel: day?.profileActivityLevel ?? profile.activityLevel,
    },
  };
});

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

  // 行が無ければ作り(このとき、プロフィールの目標などを写す)、そのあと入力の項目だけを書く。写しは更新では触らない
  return db.transaction(async (tx) => {
    await insertDayIfMissing(tx, userId, date, changes);
    const [row] = await tx
      .update(days)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(days.userId, userId), eq(days.date, date)))
      .returning();
    if (!row) throw new Error("days の行を保存できませんでした");
    return row;
  });
}

// 画面の保存用: 日の行がまだ無く、渡された項目がすべて空(null)なら、行を作らない。
// 空のまま保存した日の行ができると、その時点でプロフィールの目標が写されてしまい、あとで目標を直してから記録しても、古い目標のままになるため。
// すでに行がある日は、空に直す(消す)保存もそのまま通す
export async function saveDayUnlessEmpty(date: string, input: Partial<DayValues>) {
  await getCurrentUserId();
  assertValidDate(date);
  const allEmpty = DAY_FIELDS.every((field) => input[field] === undefined || input[field] === null);
  if (allEmpty && (await getDay(date)) === null) return null;
  return saveDay(date, input);
}
