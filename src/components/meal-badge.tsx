import { mealLabel, type MealLabel } from "@/lib/meal-time";

// 食事の種類のバッジ(朝食・昼食・夕食・間食・夜食)。食べた時刻から計算して出す(保存しない)
const STYLES: Record<MealLabel, string> = {
  朝食: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  昼食: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  夕食: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  間食: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  夜食: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
};

// time が読めない値のときは、何も出さない
export function MealBadge({ time }: { time: string }) {
  const label = mealLabel(time);
  if (label === null) return null;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[label]}`}>{label}</span>;
}
