import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { days } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString } from "@/lib/date";
import { DAY_FIELDS, type DayValues } from "@/lib/day-schema";
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

// いちばん古い記録の日(記録が無ければ null)。一覧のページの端を決めるのに使う
export async function getFirstDayDate(): Promise<string | null> {
  const userId = await getCurrentUserId();
  const [row] = await db.select({ date: days.date }).from(days).where(eq(days.userId, userId)).orderBy(asc(days.date)).limit(1);
  return row?.date ?? null;
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
