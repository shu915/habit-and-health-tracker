import "server-only";
import { z } from "zod";
import { buildUserText, parseEstimate, SYSTEM_PROMPT, type ParseResult } from "@/lib/meal-estimate";
import { mealEstimateJsonSchema } from "@/lib/meal-estimate-schema";
import { IMAGE_MAX_LENGTH, MAX_PHOTOS, TEXT_MAX_LENGTH } from "@/lib/meal-limits";
import { completeJson, OpenRouterError, type ChatMessage } from "@/lib/openrouter";

// 食事の栄養推定の入口。文章・写真から AI に品目ごとの栄養素を答えさせ、検証して合計を計算した推定を返す。
// 呼び出す Server Action 側で、先に getCurrentUserId() を呼んで認可する。写真は保存しない(この中で使い捨て)
const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

// 宣言された形式(image/png など)と、中身の先頭バイトが合っているか。偽の画像を提供元へ送って、課金や失敗の原因にしない
function matchesDeclaredType(dataUrl: string): boolean {
  const match = /^data:image\/(jpeg|png|webp);base64,/.exec(dataUrl);
  if (!match) return false;
  const head = Buffer.from(dataUrl.slice(match[0].length, match[0].length + 24), "base64");
  switch (match[1]) {
    case "jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "png":
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    default: // webp: "RIFF" + 4 バイト + "WEBP"
      return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
  }
}

const imageSchema = z
  .string()
  .max(IMAGE_MAX_LENGTH, "写真が大きすぎます")
  .regex(IMAGE_PATTERN, "写真は JPEG・PNG・WebP にしてください")
  .refine(matchesDeclaredType, "写真の形式が正しくありません。JPEG・PNG・WebP の写真を選んでください");

const inputSchema = z.object({
  text: z.string().max(TEXT_MAX_LENGTH, `食べたものは ${TEXT_MAX_LENGTH} 文字までです`),
  images: z.array(imageSchema).max(MAX_PHOTOS, `写真は ${MAX_PHOTOS} 枚までです`),
});

// 上限の値は meal-limits.ts(ブラウザ側の写真の縮小と共有する)。テストが参照できるよう、ここからも出す
export { IMAGE_MAX_LENGTH, MAX_PHOTOS, TEXT_MAX_LENGTH };

export type EstimateInput = { text: string; imageDataUrls?: readonly string[] };

type Complete = typeof completeJson;

const FAILURE_MESSAGES = {
  config: "AI の設定が済んでいません。管理者に連絡してください。",
  network: "AI に接続できませんでした。しばらくしてから、もう一度試してください。",
  http: "AI がエラーを返しました。しばらくしてから、もう一度試してください。",
  response: "AI の返事を読み取れませんでした。もう一度試してください。",
} as const;

type CheckedInput = { ok: true; text: string; imageDataUrls: string[] } | { ok: false; message: string };

// 入力(文章・写真)の検証。AI を呼ぶ前(回数を数える前)に、不正な入力を弾くために取り出してある
export function checkEstimateInput(input: { text: string; imageDataUrls?: readonly string[] }): CheckedInput {
  // 同じ写真(完全に同じ内容)は 1 枚にまとめてから検証する。同じ写真を何枚付けても、1 回分として扱う(AI が枚数分に数えるのを防ぐ)。
  // 枚数の上限(4 枚)も、まとめたあとの枚数で数える
  const checked = inputSchema.safeParse({ text: input.text, images: [...new Set(input.imageDataUrls ?? [])] });
  if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? "入力を確認してください" };
  if (checked.data.text.trim() === "" && checked.data.images.length === 0) {
    return { ok: false, message: "食べたものを入力するか、写真を選んでください。" };
  }
  return { ok: true, text: checked.data.text, imageDataUrls: checked.data.images };
}

export async function estimateMeal(input: EstimateInput, complete: Complete = completeJson): Promise<ParseResult> {
  const checked = checkEstimateInput(input);
  if (!checked.ok) return { ...checked, unreached: true }; // AI は呼んでいない

  const userText = buildUserText(checked.text);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        checked.imageDataUrls.length > 0
          ? [{ type: "text", text: userText }, ...checked.imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
          : userText,
    },
  ];

  let content: string;
  try {
    content = await complete({ messages, schemaName: "meal_estimate", jsonSchema: mealEstimateJsonSchema() });
  } catch (error) {
    if (!(error instanceof OpenRouterError)) throw error; // 想定外の失敗（プログラムの誤り）は隠さない
    console.error(`[estimate-meal] ${error.kind}: ${error.message}`); // 詳しい理由は端末のログにだけ出す
    // 設定・接続・AI のエラーは、AI に届かなかった(または、使える答えが無かった)ので、数えない。本文が読めない(response)は、AI が答えたあとなので、数える
    return { ok: false, message: FAILURE_MESSAGES[error.kind], ...(error.kind === "response" ? {} : { unreached: true as const }) };
  }

  return parseEstimate(content);
}
