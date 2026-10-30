import { z } from "zod";
import { PROFILE_LIMITS, type LimitedField } from "@/lib/profile-limits";
import { ACTIVITY_LEVEL_OPTIONS, GENDER_OPTIONS } from "@/lib/profile-options";

// プロフィール編集フォームの検証。フォームの値は文字列で届くので、空欄は null(未入力)にし、
// 数字は 10 進数だけを受け付けて(0x10・1e2 は拒否)、DB の列に合わせた形に直す。
//
// 範囲は profile-limits.ts の app(現実的な範囲)を使う。
// DB の CHECK 制約(schema.ts)は、これより広い「絶対にあり得ない値」だけを止める最後の砦

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

// 項目の範囲(app)と小数の桁数を取り出す(両端を含む)
function limitOf(field: LimitedField) {
  const { app, scale } = PROFILE_LIMITS[field];
  return { min: app.min, max: app.max, scale };
}

// 小数: scale 桁に丸めた文字列にする(numeric 列用)。丸めたあとの値で範囲を確認する
function decimalBase(label: string, field: LimitedField) {
  const { min, max, scale } = limitOf(field);
  const message = `${label}は ${min} 以上 ${max} 以下の数値で入力してください`;
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d+(\.\d+)?$/, message)
    .transform((value) => Number(value).toFixed(scale))
    .refine((value) => Number(value) >= min && Number(value) <= max, message);
}

// 整数(integer 列用)
function integerBase(label: string, field: LimitedField, nullMessage?: string) {
  const { min, max } = limitOf(field);
  const message = `${label}は ${min} 以上 ${max} 以下の整数で入力してください`;
  return z
    .string({ error: nullMessage ?? message })
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= min && value <= max, message);
}

// 任意の項目: 空欄は null(その項目を空にする)
const decimal = (label: string, field: LimitedField) => z.preprocess(emptyToNull, decimalBase(label, field).nullable());
const integer = (label: string, field: LimitedField) => z.preprocess(emptyToNull, integerBase(label, field).nullable());

// 選択式の項目: 空欄(選ばない)は null
function choice(values: readonly string[], message: string) {
  return z.preprocess(
    emptyToNull,
    z
      .string({ error: message })
      .refine((value) => values.includes(value), message)
      .nullable(),
  );
}

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
  // 睡眠の目標 2 つは DB が NOT NULL なので、空欄にできない
  targetSleepMinutes: z.preprocess(
    emptyToNull,
    integerBase("睡眠の目標(分)", "targetSleepMinutes", "睡眠の目標(分)は空にできません"),
  ),
  targetSleepMidpoint: z.preprocess(
    emptyToNull,
    z
      .string({ error: "睡眠の中間時刻は空にできません" })
      .trim()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "睡眠の中間時刻は HH:MM の形式(00:00〜23:59)で入力してください"),
  ),
});

// 検証を通った値(DB に保存する形)
export type ProfileValues = z.output<typeof fields>;
export type ProfileField = keyof ProfileValues;

// フォームのフィールド名(= fields のキー)。キーは fields で定義したものだけなので、型を付けて取り出す
export const PROFILE_FIELDS = Object.keys(fields.shape) as ProfileField[];

// 入力に「キーがあった項目」だけを検証する(キーが無い項目は検証せず、結果にも含めない = 保存しても変更されない)。
// キーがあって空欄なら null(その項目を空にする)。ただし睡眠の目標 2 つは空欄にできない
const partialSchema = fields.partial();

export type ProfileFormResult =
  | { ok: true; values: Partial<ProfileValues> }
  | { ok: false; errors: Partial<Record<ProfileField, string>> };

// フォームの値(文字列)を検証する。欄ごとの最初のエラーだけを返す。
// fields にあるキーだけを読むので、user_id などを紛れ込ませても無視される
export function parseProfileForm(raw: Record<string, unknown>): ProfileFormResult {
  const picked: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (raw[field] !== undefined) picked[field] = raw[field];
  }

  const result = partialSchema.safeParse(picked);
  if (result.success) return { ok: true, values: result.data };

  const errors: Partial<Record<ProfileField, string>> = {};
  for (const issue of result.error.issues) {
    const field = PROFILE_FIELDS.find((name) => name === issue.path[0]);
    if (field && !(field in errors)) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
