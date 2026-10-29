// 1 日の記録(フォーム入力)の検証。外部から来る値は unknown で受け、検証してから型を付ける
//
// 返す値には、入力に「キーがあった項目」だけを含める。
//   キーが無い        → 含めない(保存するとき、その項目は変更しない)
//   キーがあり空      → null(その項目を空にする)
// こうしないと、体重だけを更新するフォームが、書いた振り返りを null で消してしまう

export type DayInput = {
  morningWeightKg?: string | null; // numeric 列に入れる文字列(小数 2 桁)
  reflection?: string | null;
};

export type ParseResult = { ok: true; value: DayInput } | { ok: false; error: string };

const REFLECTION_MAX = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Field<T> = { ok: true; value: T } | { ok: false; error: string };

// 空文字・空白だけは未入力(null)。NUL 文字は PostgreSQL の text に入らないので拒否する
function parseText(value: unknown, max: number, label: string): Field<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label}は文字列で入力してください` };
  if (value.includes("\u0000")) return { ok: false, error: `${label}に使えない文字が含まれています` };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: `${label}は ${max} 文字までです` };
  return { ok: true, value: trimmed };
}

// 小数 2 桁に丸めたあとの値で範囲を確認する(499.996 → "500.00" や 0.001 → "0.00" が DB の制約で落ちないように)
function parseWeight(value: unknown): Field<string | null> {
  const error = "体重は 0 より大きく 500 未満の数値で入力してください";
  if (value === null) return { ok: true, value: null };

  let num: number;
  if (typeof value === "number") {
    num = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return { ok: true, value: null };
    // "0x10"・"1e2"・"0b11" のような表記は受け付けない(10 進数の数字だけ)
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, error };
    num = Number(trimmed);
  } else {
    return { ok: false, error };
  }

  if (!Number.isFinite(num)) return { ok: false, error };
  const fixed = num.toFixed(2);
  if (Number(fixed) <= 0 || Number(fixed) >= 500) return { ok: false, error };
  return { ok: true, value: fixed };
}

export function parseDayInput(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "入力の形式が正しくありません" };

  const value: DayInput = {};

  if (raw.morningWeightKg !== undefined) {
    const weight = parseWeight(raw.morningWeightKg);
    if (!weight.ok) return weight;
    value.morningWeightKg = weight.value;
  }

  if (raw.reflection !== undefined) {
    const reflection = parseText(raw.reflection, REFLECTION_MAX, "振り返り");
    if (!reflection.ok) return reflection;
    value.reflection = reflection.value;
  }

  return { ok: true, value };
}
