import { z } from "zod";
import { POSITIVE_BODY_MAX_LENGTH, POSITIVE_MAX_PER_DAY } from "@/lib/positive-limits";
import { parseForm, textField, type FormResult } from "@/lib/form-fields";

// ポジティブ3行日記(フォーム)の検証。欄は 1 行ずつ 3 つ(body1 〜 body3)。
// 保存は、その日の分をまとめて入れ替える。空の欄は、書かなかったものとして捨てる。
// 他のフォームと違い、キーが無い欄は空欄として扱う(まとめて入れ替えるため)

const SLOTS = Array.from({ length: POSITIVE_MAX_PER_DAY }, (_, index) => index + 1);

const shape: Record<string, ReturnType<typeof textField>> = {};
for (const n of SLOTS) shape[`body${n}`] = textField(`${n} つ目`, POSITIVE_BODY_MAX_LENGTH);

// フォームのフィールド名
export type PositiveField = `body${1 | 2 | 3}`;
export const POSITIVE_FIELDS = Object.keys(shape) as PositiveField[];

const fields = z.object(shape).partial();

export type PositiveFormResult = FormResult<string[], PositiveField>;

export function parsePositiveForm(raw: Record<string, unknown>): PositiveFormResult {
  const result = parseForm(fields, POSITIVE_FIELDS, raw);
  if (!result.ok) return result;

  // 書かれた欄だけを、書いた順に並べる(空欄はつめる)
  const bodies: string[] = [];
  for (const n of SLOTS) {
    const body = result.values[`body${n}`];
    if (body != null) bodies.push(body);
  }
  return { ok: true, values: bodies };
}
