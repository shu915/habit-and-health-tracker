import { DISH_NAME_MAX_LENGTH, MEAL_LIMITS, type MealLimitedField } from "@/lib/meal-limits";
import { mealEstimateAnswerSchema, type EstimatedItem, type MealEstimateResponse } from "@/lib/meal-estimate-schema";

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

const TOTAL_UNITS: Record<MealLimitedField, string> = { kcal: "kcal", proteinG: "g", fatG: "g", netCarbG: "g", fiberG: "g", saltG: "g" };

// 合計が、現実的な範囲(app)を超えていないか。超えていれば、その項目・値・上限を返す
function outOfRange(totals: MealTotals): { label: string; value: number; max: number; unit: string } | null {
  for (const field of Object.keys(MEAL_LIMITS) as MealLimitedField[]) {
    const value = totals[field];
    if (value === null) continue;
    const { min, max } = MEAL_LIMITS[field].app;
    if (value < min || value > max) return { label: TOTAL_LABELS[field], value, max, unit: TOTAL_UNITS[field] };
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

  const parsed = mealEstimateAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[meal-estimate] 形が合わない返事:", parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
    return { ok: false, message: INVALID_RESPONSE };
  }

  const { isMeal, notMealReason, ...meal } = parsed.data;
  // 食事として扱えない入力(食べ物でないもの、人や動物の写真など)は、推定を作らず、理由を返す(何も保存されない)
  if (!isMeal) return { ok: false, message: notMealMessage(notMealReason) };
  // 食事なのに、品目も料理名も無い返事は、使えない
  if (meal.items.length === 0 || meal.dishName === "") {
    console.error("[meal-estimate] 食事なのに品目か料理名が空");
    return { ok: false, message: INVALID_RESPONSE };
  }
  return buildEstimate(meal, knownDishNames);
}

// 食事として記録できないときの、利用者向けの文言。AI が書いた理由は、改行を除いて短く添える
export function notMealMessage(reason: string): string {
  const detail = reason.replace(/[\r\n]+/g, " ").trim().slice(0, 100);
  return `食事として記録できない内容です${detail === "" ? "" : `(${detail})`}。食べ物や飲み物の文章か写真を入れてください。`;
}

// 形の検証を通った返事から、合計をコードで計算して推定にする。合計が現実的な範囲を超えるときは失敗にする。
// 保存するときにも、画面から送られた推定をこれで作り直す(画面から送られた合計は信用しない)
export function buildEstimate(response: MealEstimateResponse, knownDishNames: readonly string[] = []): ParseResult {
  const totals = totalsOf(response.items);
  const bad = outOfRange(totals);
  if (bad) {
    console.error(`[meal-estimate] 合計が範囲外: ${bad.label} ${bad.value}${bad.unit}`);
    // どの項目がどれだけ超えたかと、対処(分けて記録する)を伝える。人数分や大量の食事は、実際にありうるので、責める言い方にしない
    return {
      ok: false,
      message: `1 回の食事として記録できる上限を超えました(${bad.label} ${bad.value}${bad.unit}。上限は ${bad.max}${bad.unit})。人数分や大量の食事は、2 回に分けて記録してください。写真が同じ料理の重複なら、1 枚にしてみてください。`,
    };
  }
  return { ok: true, estimate: { ...response, dishName: matchDishName(response.dishName, knownDishNames), totals } };
}

// --- AI に渡す指示 ---

export const SYSTEM_PROMPT = [
  "あなたは管理栄養士です。ユーザーが食べた食事（文章、または写真）から、品目ごとの栄養素を推定します。",
  "指定された JSON スキーマに従った JSON だけを返してください。説明文や前置きは付けません。",
  "まず、入力が「人が普通に食べる食べ物・飲み物の記録」として扱えるかを判断し、isMeal に答える。",
  "- 扱えないものは isMeal を false にし、notMealReason に理由を短く書き、items は空の配列、dishName と description は空文字にする。栄養素を推定してはならない。冗談や悪ふざけの入力でも同じ。",
  "- 扱えないものの例: 食べ物でないもの（靴、革製品、紙、布、洗剤、薬、化粧品、植物の観賞用の部分など）、体の一部や分泌物（かさぶた、爪、髪など）、人や赤ちゃん・動物・ペットが写っているだけの写真、食べ物と無関係な画像や文字。",
  "- 人や動物が写っていても、食べ物も写っているときは、食べ物だけを対象にする。人や動物については、書かない。",
  "- 判断に迷う食べ物（珍しい食材、食べ物の形をしたお菓子や玩具など）は、普通に食べられるものだと分かれば isMeal を true にする。",
  "- 品目ごとに、量の目安、エネルギー（kcal）、たんぱく質、脂質、炭水化物、食物繊維、食塩相当量（いずれも g）を答える。",
  "- 炭水化物には食物繊維を含める。糖質の計算や、全体の合計は、こちらで行うので、答えなくてよい。",
  "- 栄養素の値は、日本食品標準成分表（八訂）の値を基準にする。食品ごとの値を思い出して使う（例: 精白米のごはんの食物繊維は 100g あたり約 0.3g で、茶碗1杯 150g でも 0.5g 前後）。",
  "- 量が書かれていないときは、一般的な1人前を仮定し、その量を amount に書く。",
  "- 食物繊維と食塩相当量は、必ず数字で答える。日本食品標準成分表にはほぼすべての食品に値があり、含まない食品（肉・魚・卵・油・調味料など）は 0 と答える。似た食品の値から見積もってよい。null にしてよいのは、成分表に近い食品が全く無く、見当もつかないときだけ。",
  "- dishName は、食事全体を表す短く一般的な料理名にする。調理の細かい違いは入れない。",
  "- 過去の料理名の一覧が渡されたときは、同じ料理があれば、その名前を表記もそのまま使う。無ければ新しい名前を付ける。",
  "写真が渡されたときは、次に注意する。",
  "- 写真が複数あるときは、同じ食事を別の角度から写したもの、または、同じ食事の別の皿や別の品を写したもの。同じ料理が複数の写真に写っていても、1 品目にまとめて、重複して数えない。",
  "- 写真の枚数は、食べた量の倍数ではない。同じ料理の写真が複数あっても、文章で量（「4人前」「2杯」など）が書かれていなければ、1 人前として扱う。文章に量があれば、その量を 1 回だけ掛ける（写真の枚数と二重に掛けない）。",
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
