// 時間帯のバッジの色(食事と運動で共有する。片方だけ直して食い違わないよう、ここに1か所だけ置く)
export const BADGE_BASE = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium";

export const BADGE_TONE = {
  morning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  noon: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  evening: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  snack: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  night: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
} as const;
