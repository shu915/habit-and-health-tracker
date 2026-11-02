import { z } from "zod";
import { textField } from "@/lib/form-fields";
import { mealEstimateSchema } from "@/lib/meal-estimate-schema";
import { ALIAS_MAX_LENGTH } from "@/lib/meal-limits";
import { mealLabel } from "@/lib/meal-time";

// 食事を保存するときに、画面から届く値の検証。Server Action は誰でも呼べる入口なので、届いた値は信用せず、
// 推定(料理名・説明・内訳)も zod で形を確かめ直す。合計は届いた値を使わず、保存する側がコードで計算し直す(buildEstimate)
export const mealSaveSchema = z.object({
  // 食べた時刻 "HH:MM"(00:00〜26:59)
  eatenTime: z.string().refine((time) => mealLabel(time) !== null, "食べた時刻は、時を 0〜26、分を 0〜59 で入力してください"),
  alias: textField("別名", ALIAS_MAX_LENGTH), // 人が付ける別名(任意)。空は null
  estimate: mealEstimateSchema,
});

export type MealSaveInput = z.output<typeof mealSaveSchema>;

export type MealSaveErrors = { eatenTime?: string; alias?: string; form?: string };

// 検証に失敗したら、欄ごとの最初のエラーを返す(推定の中身の不備は form にまとめる)
export function parseMealSave(raw: unknown): { ok: true; values: MealSaveInput } | { ok: false; errors: MealSaveErrors } {
  const parsed = mealSaveSchema.safeParse(raw);
  if (parsed.success) return { ok: true, values: parsed.data };

  const errors: MealSaveErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "eatenTime" || field === "alias") errors[field] ??= issue.message;
    else errors.form ??= "推定の内容が正しくありません。もう一度、推定してください。";
  }
  return { ok: false, errors };
}
