import { z } from "zod";
import { DISH_NAME_MAX_LENGTH, MEAL_LIMITS } from "@/lib/meal-limits";

// AI が返す食事の推定(JSON)の形。この形が、AI に渡す JSON スキーマ(response_format)の元にもなる。
// AI には品目ごとの栄養素だけを答えさせ、合計と糖質(炭水化物 − 食物繊維)はコードで計算する(meal-estimate.ts)。
// 1 品目が 1 食の上限を超えることはないので、品目の上限も meal-limits.ts の app を使う

const amount = (max: number) => z.number().min(0).max(max);

// 名前に改行を許さない。料理名は保存され、次回以降のプロンプトの一覧に入るので、AI の返事に混ざった改行が指示になるのを防ぐ。
// refine は JSON スキーマには出ない(提供元が受け付けないキーワードを増やさない)
const oneLine = (value: string) => !/[\r\n]/.test(value);
const ONE_LINE_MESSAGE = "改行を含められません";

export const estimatedItemSchema = z.object({
  name: z.string().trim().min(1).max(DISH_NAME_MAX_LENGTH).refine(oneLine, ONE_LINE_MESSAGE).describe("品目の名前（例: 焼鮭、白ご飯、みそ汁）"),
  amount: z.string().trim().max(100).describe("量の目安（例: 1切れ 80g、茶碗1杯 150g）"),
  kcal: amount(MEAL_LIMITS.kcal.app.max).describe("エネルギー（kcal）"),
  proteinG: amount(MEAL_LIMITS.proteinG.app.max).describe("たんぱく質（g）"),
  fatG: amount(MEAL_LIMITS.fatG.app.max).describe("脂質（g）"),
  carbohydrateG: amount(MEAL_LIMITS.netCarbG.app.max).describe("炭水化物（g。食物繊維を含む）"),
  fiberG: amount(MEAL_LIMITS.fiberG.app.max).nullable().describe("食物繊維（g）。分からなければ null"),
  saltG: amount(MEAL_LIMITS.saltG.app.max).nullable().describe("食塩相当量（g）。分からなければ null"),
  // この品目の数字の、見えない前提(調理法・油・砂糖・量)。画面の品目の下に出す。以前に保存した品目には無い(省略できる)
  assumption: z
    .string()
    .trim()
    .max(100)
    .refine(oneLine, ONE_LINE_MESSAGE)
    .optional()
    .describe("この品目の数字の前提を、20〜30 文字ほどで短く。量や重さは書かない（例: フライパンで油を引くと仮定、ノンフライヤーで油を使わない、砂糖入りのたれと仮定）。調理法・油・砂糖の仮定が無ければ空文字"),
});

export const mealEstimateSchema = z.object({
  dishName: z
    .string()
    .trim()
    .min(1)
    .max(DISH_NAME_MAX_LENGTH)
    .refine(oneLine, ONE_LINE_MESSAGE)
    .describe("この食事全体の料理名。短い名前。調理法が分かるときは入れる（例: 焼鮭定食、ノンフライヤーの鶏もも肉、バター炒めの野菜）"),
  description: z.string().trim().max(1000).describe("ユーザーが書いた内容（写真から読み取った内容を含む）を、意味を変えずに読みやすく整えた説明。再推定の入力になる"),
  items: z.array(estimatedItemSchema).min(1).max(30).describe("品目ごとの内訳"),
});

// AI の返事の形。mealEstimateSchema に、「食事として扱えるか」の判定を足したもの。
// 食べ物でないもの(靴、薬、体の一部、人や動物の写真など)には、栄養素を作らせない: isMeal を false にして、品目は空にできる。
// isMeal を先頭に置く(品目より先に、食べ物かどうかを決めさせる)。料理名・説明も、食べ物でないときは空でよい
export const mealEstimateAnswerSchema = z.object({
  isMeal: z.boolean().describe("人が食べる食べ物・飲み物の記録として扱えるときだけ true。食べ物でないもの、人や動物が写っているだけの写真などは false"),
  notMealReason: z.string().trim().max(200).describe("isMeal が false のとき、扱えない理由を短く（例: 食べ物ではないため）。true のときは空文字"),
  dishName: z.string().trim().max(DISH_NAME_MAX_LENGTH).refine(oneLine, ONE_LINE_MESSAGE).describe(mealEstimateSchema.shape.dishName.description ?? ""),
  description: mealEstimateSchema.shape.description,
  items: z.array(estimatedItemSchema).max(30).describe("品目ごとの内訳。isMeal が false のときは空の配列"),
});

export type MealEstimateAnswer = z.output<typeof mealEstimateAnswerSchema>;
export type EstimatedItem = z.output<typeof estimatedItemSchema>;
export type MealEstimateResponse = z.output<typeof mealEstimateSchema>;

// 提供元（Google）が受け付けない JSON スキーマのキーワード。文字数・数の範囲・品目の数の制約と、strict 用の指定。
// これらを含めると 400（INVALID_ARGUMENT）になることを、実際の呼び出しで確かめた。
// 外した制約は、AI の返事を受け取ったあとの zod の検証（parseEstimate）が引き続き守る
export const UNSUPPORTED_SCHEMA_KEYWORDS = [
  "$schema",
  "additionalProperties",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "pattern", // 将来 regex を使っても、提供元に送るスキーマには出さない
] as const;

function withoutUnsupportedKeywords(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutUnsupportedKeywords);
  if (typeof node !== "object" || node === null) return node;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!(UNSUPPORTED_SCHEMA_KEYWORDS as readonly string[]).includes(key)) cleaned[key] = withoutUnsupportedKeywords(value);
  }
  return cleaned;
}

// OpenRouter の response_format に渡す JSON スキーマ（zod から作り、提供元が受け付けないキーワードを外す）。
// 形（項目名・型・必須・説明）だけを AI に伝える。範囲などの検証は、返事を受け取ったあとに zod で行う
export function mealEstimateJsonSchema(): Record<string, unknown> {
  const cleaned = withoutUnsupportedKeywords(z.toJSONSchema(mealEstimateAnswerSchema));
  return cleaned as Record<string, unknown>;
}
