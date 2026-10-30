import { z } from "zod";
import { DAY_LIMITS, REFLECTION_MAX_LENGTH, type DayLimitedField } from "@/lib/day-limits";
import { decimalField, parseForm, textField, type FormResult, type Range } from "@/lib/form-fields";

// 日の記録(編集フォーム)の検証。プロフィールの profile-schema.ts と同じ作り:
//   - 値は文字列で届く。空欄は null(その項目を空にする)。10 進数だけを受け付け(0x10・1e2 は拒否)、列の桁数に丸める
//   - 入力に「キーがあった項目」だけを検証して返す(キーが無い項目は、保存しても変更されない)
//   - 範囲は day-limits.ts の app。DB の CHECK 制約(schema.ts)は、これより広い「絶対にあり得ない値」だけを止める最後の砦

function limitOf(field: DayLimitedField): Range {
  const { app, scale } = DAY_LIMITS[field];
  return { min: app.min, max: app.max, scale };
}

const fields = z.object({
  morningWeightKg: decimalField("朝の体重(kg)", limitOf("morningWeightKg")),
  morningBodyFatPercent: decimalField("朝の体脂肪率(%)", limitOf("morningBodyFatPercent")),
  reflection: textField("夜の振り返り", REFLECTION_MAX_LENGTH),
});

// 検証を通った値(DB に保存する形)
export type DayValues = z.output<typeof fields>;
export type DayField = keyof DayValues;

// フォームのフィールド名(= fields のキー)
export const DAY_FIELDS = Object.keys(fields.shape) as DayField[];

const partialSchema = fields.partial();

export type DayFormResult = FormResult<Partial<DayValues>, DayField>;

export function parseDayForm(raw: Record<string, unknown>): DayFormResult {
  return parseForm(partialSchema, DAY_FIELDS, raw);
}
