import { BADGE_BASE, BADGE_TONE } from "@/components/badge-tone";
import { mealLabel, type MealLabel } from "@/lib/meal-time";

// 食事の種類のバッジ(朝食・昼食・夕食・間食・夜食)。食べた時刻から計算して出す(保存しない)
const STYLES: Record<MealLabel, string> = {
  朝食: BADGE_TONE.morning,
  昼食: BADGE_TONE.noon,
  夕食: BADGE_TONE.evening,
  間食: BADGE_TONE.snack,
  夜食: BADGE_TONE.night,
};

// time が読めない値のときは、何も出さない
export function MealBadge({ time }: { time: string }) {
  const label = mealLabel(time);
  if (label === null) return null;
  return <span className={`${BADGE_BASE} ${STYLES[label]}`}>{label}</span>;
}
