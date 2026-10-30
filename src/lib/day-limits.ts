import type { Bound } from "@/lib/profile-limits";

// 日の記録の値の範囲。プロフィールの profile-limits.ts と同じ決まり:
//   app: 現実的な範囲(zod とフォームが使う) / db: DB の CHECK 制約が止める広い範囲。app は db の内側にあること
export type DayLimitedField = "morningWeightKg" | "morningBodyFatPercent";

type Limit = { scale: number; app: Bound; db: Bound };

export const DAY_LIMITS: Record<DayLimitedField, Limit> = {
  // 体重は、プロフィールの現在の体重と同じ範囲
  morningWeightKg: {
    scale: 2,
    app: { min: 20, max: 300 },
    db: { min: 0, max: 500, minExclusive: true, maxExclusive: true },
  },
  // 体脂肪率(%)。app は体重計が出す現実的な値
  morningBodyFatPercent: {
    scale: 1,
    app: { min: 3, max: 60 },
    db: { min: 0, max: 100, minExclusive: true, maxExclusive: true },
  },
};

// 夜の振り返り(自由記入)の文字数の上限
export const REFLECTION_MAX_LENGTH = 2000;

// フォームに出す範囲の文字列("20〜300")
export function formatDayRange(field: DayLimitedField): string {
  const { min, max } = DAY_LIMITS[field].app;
  return `${min}〜${max}`;
}
