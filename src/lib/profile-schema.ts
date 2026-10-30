import { z } from "zod";
import { choiceField, decimalField, emptyToNull, integerField, parseForm, type FormResult, type Range } from "@/lib/form-fields";
import { PROFILE_LIMITS, type LimitedField } from "@/lib/profile-limits";
import { ACTIVITY_LEVEL_OPTIONS, GENDER_OPTIONS } from "@/lib/profile-options";

// プロフィール編集フォームの検証。フォームの値は文字列で届くので、空欄は null(未入力)にし、
// 数字は 10 進数だけを受け付けて(0x10・1e2 は拒否)、DB の列に合わせた形に直す。
//
// 範囲は profile-limits.ts の app(現実的な範囲)を使う。
// DB の CHECK 制約(schema.ts)は、これより広い「絶対にあり得ない値」だけを止める最後の砦

// 項目の範囲(app)と小数の桁数を取り出す(両端を含む)
function limitOf(field: LimitedField): Range {
  const { app, scale } = PROFILE_LIMITS[field];
  return { min: app.min, max: app.max, scale };
}

const decimal = (label: string, field: LimitedField) => decimalField(label, limitOf(field));
const integer = (label: string, field: LimitedField, customMessage?: string) =>
  integerField(label, limitOf(field), customMessage);
const choice = choiceField;

const fields = z.object({
  gender: choice(
    GENDER_OPTIONS.map((option) => option.value),
    "性別を選んでください",
  ),
  age: integer("年齢", "age"),
  heightCm: decimal("身長(cm)", "heightCm"),
  currentWeightKg: decimal("現在の体重(kg)", "currentWeightKg"),
  currentBodyFatPercent: decimal("体脂肪率(%)", "currentBodyFatPercent"),
  currentWaistCm: decimal("ウエスト(cm)", "currentWaistCm"),
  activityLevel: choice(
    ACTIVITY_LEVEL_OPTIONS.map((option) => option.value),
    "活動係数を選んでください",
  ),
  targetWeightKg: decimal("目標体重(kg)", "targetWeightKg"),
  targetCalories: integer("目標カロリー(kcal)", "targetCalories"),
  targetProteinG: decimal("目標タンパク質(g)", "targetProteinG"),
  // 睡眠の目標。空欄は null(睡眠の機能を使わない)。新しいユーザーには、DB の既定値(450 分 / 03:15)が入る
  // 画面では「時間」「分」で入力する(裏で分に変換して送る)ので、メッセージも時間で書く
  targetSleepMinutes: integer(
    "睡眠時間の目標",
    "targetSleepMinutes",
    "睡眠時間の目標は 2 時間から 18 時間のあいだで入力してください",
  ),
  targetSleepMidpoint: z.preprocess(
    emptyToNull,
    z
      .string({ error: "睡眠の中間時刻は、時を 0〜23、分を 0〜59 で入力してください" })
      .trim()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "睡眠の中間時刻は、時を 0〜23、分を 0〜59 で入力してください")
      .nullable(),
  ),
});

// 検証を通った値(DB に保存する形)
export type ProfileValues = z.output<typeof fields>;
export type ProfileField = keyof ProfileValues;

// フォームのフィールド名(= fields のキー)。キーは fields で定義したものだけなので、型を付けて取り出す
export const PROFILE_FIELDS = Object.keys(fields.shape) as ProfileField[];

// 入力に「キーがあった項目」だけを検証する(キーが無い項目は検証せず、結果にも含めない = 保存しても変更されない)。
// キーがあって空欄なら null(その項目を空にする)
const partialSchema = fields.partial();

export type ProfileFormResult = FormResult<Partial<ProfileValues>, ProfileField>;

// フォームの値(文字列)を検証する。欄ごとの最初のエラーだけを返す
export function parseProfileForm(raw: Record<string, unknown>): ProfileFormResult {
  return parseForm(partialSchema, PROFILE_FIELDS, raw);
}
