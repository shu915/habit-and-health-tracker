import { DISH_NAME_MAX_LENGTH, MEAL_LIMITS, type MealLimitedField } from "@/lib/meal-limits";
import { mealEstimateSchema, type EstimatedItem, type MealEstimateResponse } from "@/lib/meal-estimate-schema";

// AI の返事から、保存できる推定を作る(純粋な計算と検証。HTTP は openrouter.ts、入口は estimate-meal.ts)。
// 合計と糖質はコードで計算する(AI に足し算・引き算をさせない)。計算した合計は meal-limits.ts の app の範囲で確かめる

// 1 食の合計(meals の列に入れる値。糖質 = 炭水化物 − 食物繊維)
export type MealTotals = {
  kcal: number; // 整数
  proteinG: number; // 小数 1 桁
  fatG: number;
  netCarbG: number;
  fiberG: number | null; // どの品目も分からなければ null
  saltG: number | null;
};

export type MealEstimate = MealEstimateResponse & { totals: MealTotals };

export type ParseResult = { ok: true; estimate: MealEstimate } | { ok: false; message: string };

const round1 = (value: number) => Math.round(value * 10) / 10;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// 分かっている品目だけを足す。すべて null なら null
function sumNullable(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : round1(sum(known));
}

// 品目ごとの糖質。食物繊維が炭水化物より多い返事でも、負の値にしない
const netCarbOf = (item: EstimatedItem) => Math.max(item.carbohydrateG - (item.fiberG ?? 0), 0);

export function totalsOf(items: EstimatedItem[]): MealTotals {
  return {
    kcal: Math.round(sum(items.map((item) => item.kcal))),
    proteinG: round1(sum(items.map((item) => item.proteinG))),
    fatG: round1(sum(items.map((item) => item.fatG))),
    netCarbG: round1(sum(items.map(netCarbOf))),
    fiberG: sumNullable(items.map((item) => item.fiberG)),
    saltG: sumNullable(items.map((item) => item.saltG)),
  };
}

const TOTAL_LABELS: Record<MealLimitedField, string> = {
  kcal: "エネルギー",
  proteinG: "たんぱく質",
  fatG: "脂質",
  netCarbG: "糖質",
  fiberG: "食物繊維",
  saltG: "食塩相当量",
};

// 合計が、現実的な範囲(app)を超えていないか。超えていれば、その項目の名前を返す
function outOfRange(totals: MealTotals): string | null {
  for (const field of Object.keys(MEAL_LIMITS) as MealLimitedField[]) {
    const value = totals[field];
    if (value === null) continue;
    const { min, max } = MEAL_LIMITS[field].app;
    if (value < min || value > max) return TOTAL_LABELS[field];
  }
  return null;
}

// 料理名を比べるための形: 全角・半角と大文字・小文字をそろえ、空白を取る
export function normalizeDishName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

// 過去の料理名に同じ料理があれば、その名前(保存されている表記)にそろえる。無ければ AI の名前のまま
export function matchDishName(name: string, knownNames: readonly string[]): string {
  const target = normalizeDishName(name);
  return knownNames.find((known) => normalizeDishName(known) === target) ?? name;
}

// モデルが ```json ... ``` で囲んで返すことがあるので、囲みを外す。正規表現を使わず、前後を順に調べる(長い返事でも遅くならない)
function stripCodeFence(content: string): string {
  let text = content.trim();
  if (!text.startsWith("```")) return content;
  text = text.slice(3);
  if (text.toLowerCase().startsWith("json")) text = text.slice(4);
  text = text.trimEnd();
  if (text.endsWith("```")) text = text.slice(0, -3);
  return text.trim();
}

const INVALID_RESPONSE = "AI の返事を読み取れませんでした。もう一度試してください。";

// AI の返事(文字列)を、検証して推定にする。外から来るデータなので、unknown として JSON.parse し、zod で形を確かめる。
// 形が違う・合計が現実的な範囲を超える返事は、保存せずに失敗にする(理由は端末のログにだけ出す)
export function parseEstimate(content: string, knownDishNames: readonly string[] = []): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(content));
  } catch {
    console.error("[meal-estimate] JSON として読めない返事");
    return { ok: false, message: INVALID_RESPONSE };
  }

  const parsed = mealEstimateSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[meal-estimate] 形が合わない返事:", parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
    return { ok: false, message: INVALID_RESPONSE };
  }

  const totals = totalsOf(parsed.data.items);
  const bad = outOfRange(totals);
  if (bad) {
    console.error(`[meal-estimate] 合計が範囲外: ${bad}`);
    return { ok: false, message: "AI の推定が現実的な範囲を超えていました。内容を見直して、もう一度試してください。" };
  }

  return {
    ok: true,
    estimate: { ...parsed.data, dishName: matchDishName(parsed.data.dishName, knownDishNames), totals },
  };
}

// --- AI に渡す指示 ---

export const SYSTEM_PROMPT = [
  "あなたは管理栄養士です。ユーザーが食べた食事（文章、または写真）から、品目ごとの栄養素を推定します。",
  "指定された JSON スキーマに従った JSON だけを返してください。説明文や前置きは付けません。",
  "- 品目ごとに、量の目安、エネルギー（kcal）、たんぱく質、脂質、炭水化物、食物繊維、食塩相当量（いずれも g）を答える。",
  "- 炭水化物には食物繊維を含める。糖質の計算や、全体の合計は、こちらで行うので、答えなくてよい。",
  "- 栄養素の値は、日本食品標準成分表（八訂）の値を基準にする。食品ごとの値を思い出して使う（例: 精白米のごはんの食物繊維は 100g あたり約 0.3g で、茶碗1杯 150g でも 0.5g 前後）。",
  "- 量が書かれていないときは、一般的な1人前を仮定し、その量を amount に書く。",
  "- 食物繊維と食塩相当量が分からない品目は null にする。",
  "- dishName は、食事全体を表す短く一般的な料理名にする。調理の細かい違いは入れない。",
  "- 過去の料理名の一覧が渡されたときは、同じ料理があれば、その名前を表記もそのまま使う。無ければ新しい名前を付ける。",
  "写真が渡されたときは、次に注意する。",
  "- 写っている食べ物・飲み物を 1 つずつ数える。同じものを二重に数えない（同じ皿が別の角度や反射で 2 回見えても 1 品目）。",
  "- 料理に入っている具やトッピング（汁の具、丼の上の具、ドレッシングなど）は、その料理の一部として 1 品目にまとめる。別の品目にして足さない。",
  "- 食べていないもの（空の皿、手つかずの他の人の料理、飾りだけのもの）は数えない。",
  "- 量（サイズ感）は、写っている基準になるもの（箸は約23cm、茶碗は直径約11〜12cm、スプーン、皿、缶やペットボトル、手）を手がかりに見積もる。基準が無ければ一般的な1人前とし、amount に仮定と書く。",
  "- 見えない中身（丼の下の具、器の奥）は、一般的な内容を仮定し、仮定したと description に書く。",
  "- 写真から量や品目を判断したものは、amount に「約」を付ける。品目の判別に自信がないもの（中身が見えにくい小鉢など）は、description に「〜に見える」と書き、断定しない。",
  "- 文章も渡されたときは、文章の内容（量、食べた分、食べなかったもの）を写真より優先する。",
  "- description には、ユーザーが書いた内容（写真から読み取ったものを含む）を、読みやすく整えて書く。意味を変えない：品目・量・調理法を足したり、省いたり、言い換えて別のものにしたりしない。推定のために仮定した量は、仮定したと分かるように添える。",
].join("\n");

const MAX_KNOWN_NAMES = 100;

export function buildUserText(text: string, knownDishNames: readonly string[]): string {
  // 料理名は AI が返した文字列が保存されたもの。改行を空白にし、長さを切って、一覧の外へ指示が漏れないようにする
  const names = knownDishNames.slice(0, MAX_KNOWN_NAMES).map((name) => name.replace(/[\r\n]+/g, " ").trim().slice(0, DISH_NAME_MAX_LENGTH));
  const known = names.length === 0 ? "（まだありません）" : names.map((name) => `- ${name}`).join("\n");
  return [`食べたもの:\n${text.trim() === "" ? "（写真を見て判断してください）" : text.trim()}`, `過去の料理名の一覧:\n${known}`].join("\n\n");
}
