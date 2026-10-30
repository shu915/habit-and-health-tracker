import { z } from "zod";

// フォームの値(文字列)を検証する zod の部品。プロフィールと日の記録で共通に使う。
// 空欄は null(未入力)にし、数字は 10 進数だけを受け付けて(0x10・1e2 は拒否)、DB の列に合わせた形に直す

export const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

export type Range = { min: number; max: number; scale: number }; // 両端を含む。scale は小数の桁数(整数は 0)

// 小数: scale 桁に丸めた文字列にする(numeric 列用)。丸めたあとの値で範囲を確認する
export function decimalBase(label: string, { min, max, scale }: Range) {
  const message = `${label}は ${min} 以上 ${max} 以下の数値で入力してください`;
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d+(\.\d+)?$/, message)
    .transform((value) => Number(value).toFixed(scale))
    .refine((value) => Number(value) >= min && Number(value) <= max, message);
}

// 整数(integer 列用)
export function integerBase(label: string, { min, max }: Range, customMessage?: string) {
  const message = customMessage ?? `${label}は ${min} 以上 ${max} 以下の整数で入力してください`;
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= min && value <= max, message);
}

// 任意の項目: 空欄は null(その項目を空にする)
export const decimalField = (label: string, range: Range) =>
  z.preprocess(emptyToNull, decimalBase(label, range).nullable());
export const integerField = (label: string, range: Range, customMessage?: string) =>
  z.preprocess(emptyToNull, integerBase(label, range, customMessage).nullable());

// 時刻("HH:MM"): 任意の項目で、空欄は null。画面では「時」「分」の2欄で入力し、"HH:MM" に直して送る
export function timeOfDayField(label: string) {
  const message = `${label}は、時を 0〜23、分を 0〜59 で入力してください`;
  return z.preprocess(
    emptyToNull,
    z
      .string({ error: message })
      .trim()
      .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, message)
      .nullable(),
  );
}

// 選択式の項目: 空欄(選ばない)は null
export function choiceField(values: readonly string[], message: string) {
  return z.preprocess(
    emptyToNull,
    z
      .string({ error: message })
      .refine((value) => values.includes(value), message)
      .nullable(),
  );
}

// 自由記入の文字列: 前後の空白を取り、空白だけなら null。長さの上限があり、NUL 文字は PostgreSQL の text に入らないので拒否する
export function textField(label: string, maxLength: number) {
  return z.preprocess(
    emptyToNull,
    z
      .string({ error: `${label}は文字列で入力してください` })
      .refine((value) => !value.includes("\u0000"), `${label}に使えない文字が含まれています`)
      .trim()
      .max(maxLength, `${label}は ${maxLength} 文字までです`)
      .nullable(),
  );
}

export type FormResult<Values, Field extends string> =
  | { ok: true; values: Values }
  | { ok: false; errors: Partial<Record<Field, string>> };

// 入力に「キーがあった項目」だけを検証する(キーが無い項目は検証せず、結果にも含めない = 保存しても変更されない)。
// fields にあるキーだけを読むので、user_id などを紛れ込ませても無視される。欄ごとに最初のエラーだけを返す
export function parseForm<Values, Field extends string>(
  schema: z.ZodType<Values>,
  fields: readonly Field[],
  raw: Record<string, unknown>,
): FormResult<Values, Field> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (raw[field] !== undefined) picked[field] = raw[field];
  }

  const result = schema.safeParse(picked);
  if (result.success) return { ok: true, values: result.data };

  const errors: Partial<Record<Field, string>> = {};
  for (const issue of result.error.issues) {
    const field = fields.find((name) => name === issue.path[0]);
    if (field && !(field in errors)) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
