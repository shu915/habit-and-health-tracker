import type { Bound } from "@/lib/profile-limits";

// 食事の値の範囲。プロフィールの profile-limits.ts、日の記録の day-limits.ts と同じ決まり:
//   app: 現実的な範囲(zod とフォームが使う) / db: DB の CHECK 制約が止める広い範囲。app は db の内側にあること
export type MealLimitedField = "kcal" | "proteinG" | "fatG" | "netCarbG" | "fiberG" | "saltG";

type Limit = { scale: number; app: Bound; db: Bound };

export const MEAL_LIMITS: Record<MealLimitedField, Limit> = {
  kcal: { scale: 0, app: { min: 0, max: 5000 }, db: { min: 0, max: 20000 } },
  proteinG: { scale: 1, app: { min: 0, max: 300 }, db: { min: 0, max: 1000 } },
  fatG: { scale: 1, app: { min: 0, max: 300 }, db: { min: 0, max: 1000 } },
  // 糖質(炭水化物 − 食物繊維)
  netCarbG: { scale: 1, app: { min: 0, max: 800 }, db: { min: 0, max: 2000 } },
  fiberG: { scale: 1, app: { min: 0, max: 100 }, db: { min: 0, max: 500 } },
  // 食塩相当量(g)
  saltG: { scale: 1, app: { min: 0, max: 30 }, db: { min: 0, max: 100 } },
};

// 食べた時刻の時の上限。深夜 3 時までは前の日の食事として入れるので、26 時(26:59)まで書ける
export const MEAL_TIME_MAX_HOUR = 26;

// 料理名(dish_name)と別名(alias)の文字数の上限(列の長さと同じ)
export const DISH_NAME_MAX_LENGTH = 100;
export const ALIAS_MAX_LENGTH = 100;
