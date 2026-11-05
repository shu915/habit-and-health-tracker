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

// 料理名(dish_name)の文字数の上限(列の長さと同じ)
export const DISH_NAME_MAX_LENGTH = 100;

// 食事の推定に送る入力の上限(サーバーの検証と、ブラウザ側の写真の縮小で共有する)
export const TEXT_MAX_LENGTH = 2000; // 食べたものの文章の文字数
// 写真は、最大 4 枚(同じ食事の別の角度や、別の皿)。ブラウザ側で縮小して送る。
// 1 枚あたりの data URL の文字数の上限。縮小した写真(数百 KB)が通る大きさ。
// 4 枚 × 1 枚の上限(3.6MB 相当)が、Server Action の本文の上限(4MB。next.config.ts)に収まる。この関係を変えるときは、両方を直す
export const MAX_PHOTOS = 4;
export const IMAGE_MAX_LENGTH = 900_000;

// 食事の id(PostgreSQL の serial = int4)として、ありうる値か。範囲外の数を DB に渡すとエラー(500)になるので、手前で弾いて 404 にする
export const MAX_ID = 2_147_483_647;
export function isMealId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= MAX_ID;
}
