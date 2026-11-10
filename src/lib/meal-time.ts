import { shiftDate, todayString } from "@/lib/date";
import { MEAL_TIME_MAX_HOUR } from "@/lib/meal-limits";
import { zonedParts } from "@/lib/time-zone";

// 食べた時刻("HH:MM")の扱い。「その日」は 03:00 から翌 02:59 までで、深夜の食事は前の日に入れる。
// そのため時刻は 00:00〜26:59 まで書ける(24:00 以降は翌日の深夜。25:30 = 翌日の 1 時 30 分)
export const MEAL_DAY_START_HOUR = 3;

// 食事の種類のラベル(バッジに出す)。保存せず、時刻から計算する(境界はここの定数で、手では直せない)
export type MealLabel = "朝食" | "昼食" | "夕食" | "間食" | "夜食";

// [from, to) を、その日の 0:00 からの分で表す。どれにも当たらない時刻は「間食」(例: 14:00〜16:59、00:00〜03:59)。
// 22:00 以降は夜食とした(暫定。22:00〜23:59 を間食にするかは、使ってみて決める)
const LABEL_RANGES: { label: MealLabel; from: number; to: number }[] = [
  { label: "朝食", from: 4 * 60, to: 11 * 60 },
  { label: "昼食", from: 11 * 60, to: 14 * 60 },
  { label: "夕食", from: 17 * 60, to: 22 * 60 },
  { label: "夜食", from: 22 * 60, to: (MEAL_TIME_MAX_HOUR + 1) * 60 },
];

const TIME_PATTERN = /^(\d{2}):([0-5]\d)$/;

// "11:30" → 690(分)。形が違う・時が 26 を超える値は null
function minutesOf(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > MEAL_TIME_MAX_HOUR) return null;
  return hours * 60 + Number(match[2]);
}

// 食べた時刻から、食事の種類。形が違う値は null
export function mealLabel(time: string): MealLabel | null {
  const minutes = minutesOf(time);
  if (minutes === null) return null;
  return LABEL_RANGES.find((range) => minutes >= range.from && minutes < range.to)?.label ?? "間食";
}

// 食事を追加するときの、日付と食べた時刻の初期値(日本時間。lib/time-zone.ts)。
// 03:00 より前は前の日の食事として、日付を前日にし、時刻は 24 を足す(01:30 → 前日の 25:30)
export function defaultMealDayAndTime(now: Date = new Date()): { date: string; time: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const { hour: hours, minute } = zonedParts(now);
  const minutes = pad(minute);
  if (hours < MEAL_DAY_START_HOUR) {
    return { date: shiftDate(todayString(now), -1), time: `${pad(hours + 24)}:${minutes}` };
  }
  return { date: todayString(now), time: `${pad(hours)}:${minutes}` };
}
