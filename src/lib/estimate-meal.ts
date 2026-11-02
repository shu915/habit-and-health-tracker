import "server-only";
import { z } from "zod";
import { buildUserText, parseEstimate, SYSTEM_PROMPT, type ParseResult } from "@/lib/meal-estimate";
import { mealEstimateJsonSchema } from "@/lib/meal-estimate-schema";
import { completeJson, OpenRouterError, type ChatMessage } from "@/lib/openrouter";

// 食事の栄養推定の入口。文章・写真から AI に品目ごとの栄養素を答えさせ、検証して合計を計算した推定を返す。
// 呼び出す Server Action 側で、先に getCurrentUserId() を呼んで認可する。写真は保存しない(この中で使い捨て)
export const TEXT_MAX_LENGTH = 2000;
const IMAGE_MAX_LENGTH = 8_000_000; // data URL の文字数（base 64 で約 6MB の画像）
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

const inputSchema = z.object({
  text: z.string().max(TEXT_MAX_LENGTH, `食べたものは ${TEXT_MAX_LENGTH} 文字までです`),
  imageDataUrl: z
    .string()
    .max(IMAGE_MAX_LENGTH, "写真が大きすぎます")
    .regex(IMAGE_PATTERN, "写真は JPEG・PNG・WebP にしてください")
    .refine(matchesDeclaredType, "写真の形式が正しくありません。JPEG・PNG・WebP の写真を選んでください")
    .optional(),
});

export type EstimateInput = { text: string; imageDataUrl?: string; knownDishNames?: readonly string[] };

type Complete = typeof completeJson;

const FAILURE_MESSAGES = {
  config: "AI の設定が済んでいません。管理者に連絡してください。",
  network: "AI に接続できませんでした。しばらくしてから、もう一度試してください。",
  http: "AI がエラーを返しました。しばらくしてから、もう一度試してください。",
  response: "AI の返事を読み取れませんでした。もう一度試してください。",
} as const;

export async function estimateMeal(input: EstimateInput, complete: Complete = completeJson): Promise<ParseResult> {
  const checked = inputSchema.safeParse({ text: input.text, imageDataUrl: input.imageDataUrl });
  if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? "入力を確認してください" };
  if (checked.data.text.trim() === "" && !checked.data.imageDataUrl) {
    return { ok: false, message: "食べたものを入力するか、写真を選んでください。" };
  }

  const userText = buildUserText(checked.data.text, input.knownDishNames ?? []);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: checked.data.imageDataUrl
        ? [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: checked.data.imageDataUrl } },
          ]
        : userText,
    },
  ];

  let content: string;
  try {
    content = await complete({ messages, schemaName: "meal_estimate", jsonSchema: mealEstimateJsonSchema() });
  } catch (error) {
    if (!(error instanceof OpenRouterError)) throw error; // 想定外の失敗（プログラムの誤り）は隠さない
    console.error(`[estimate-meal] ${error.kind}: ${error.message}`); // 詳しい理由は端末のログにだけ出す
    return { ok: false, message: FAILURE_MESSAGES[error.kind] };
  }

  return parseEstimate(content, input.knownDishNames ?? []);
}
