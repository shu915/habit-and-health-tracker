import { MEAL_DAY_START_HOUR } from "@/lib/meal-time";

// 運動の開始時刻("HH:MM"、00:00〜26:59)から、時間帯のラベル(午前・午後・夜)を出す(バッジ用。保存せず、時刻から計算する)。
// 「その日」は 03:00 から翌 02:59 まで(食事と同じ)。境界は暫定で、ここの定数で決める
export type ExerciseTimeLabel = "午前" | "午後" | "夜";

const NOON_HOUR = 12;
const EVENING_HOUR = 18;

const TIME_PATTERN = /^(\d{2}):([0-5]\d)$/;

// 午前: 03:00〜11:59 / 午後: 12:00〜17:59 / 夜: 18:00 以降と、00:00〜02:59(24 時以降の深夜を含む)。形が違う・27 時以降は null
export function exerciseTimeLabel(time: string | null): ExerciseTimeLabel | null {
  if (time === null) return null;
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 26) return null;
  if (hours < MEAL_DAY_START_HOUR) return "夜";
  if (hours < NOON_HOUR) return "午前";
  if (hours < EVENING_HOUR) return "午後";
  return "夜";
}
