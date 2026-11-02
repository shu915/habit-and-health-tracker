import { z } from "zod";
import { EXERCISE_INTENSITY_KEYS, EXERCISE_TYPE_KEYS } from "@/lib/exercise";
import { EXERCISE_LIMITS, EXERCISE_MEMO_MAX_LENGTH } from "@/lib/exercise-limits";
import { integerBase, parseForm, textField, type FormResult } from "@/lib/form-fields";

// 運動の記録(フォーム)の検証。日の記録の day-schema.ts と同じ作り: 値は文字列で届き、欄ごとに最初のエラーを返す。
// 日の記録と違い、種類・強さ・時間は必須(キーが無い・空なら、その欄のエラー)。メモだけが任意で、空欄は null

function requiredChoice(keys: readonly string[], message: string) {
  return z.string({ error: message }).refine((value) => keys.includes(value), message);
}

const fields = z.object({
  type: requiredChoice(EXERCISE_TYPE_KEYS, "種類を選んでください"),
  intensity: requiredChoice(EXERCISE_INTENSITY_KEYS, "強さを選んでください"),
  minutes: integerBase("時間(分)", { ...EXERCISE_LIMITS.minutes.app, scale: 0 }),
  memo: textField("メモ", EXERCISE_MEMO_MAX_LENGTH),
});

// 検証を通った値(DB に保存する形)
export type ExerciseValues = z.output<typeof fields>;
export type ExerciseField = keyof ExerciseValues;

// フォームのフィールド名(= fields のキー)
export const EXERCISE_FIELDS = Object.keys(fields.shape) as ExerciseField[];

export type ExerciseFormResult = FormResult<ExerciseValues, ExerciseField>;

export function parseExerciseForm(raw: Record<string, unknown>): ExerciseFormResult {
  return parseForm(fields, EXERCISE_FIELDS, raw);
}
