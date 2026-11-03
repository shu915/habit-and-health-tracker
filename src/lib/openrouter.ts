import "server-only";
import { z } from "zod";

// OpenRouter(OpenAI 互換の chat completions)を呼ぶだけの層。API キーを読むのはここだけで、サーバー側でしか動かない。
// 返事の中身の検証は呼び出し側(meal-estimate.ts)。モデル名は環境変数 OPENROUTER_MODEL で切り替える
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// 1 回の呼び出しの待ち時間。ふだんは数秒〜写真でも十数秒で終わる。たまに応答が返らないまま待たされることがあり、
// そのときは待ち続けるより、切って呼び直したほうが早く終わる(実際、40 秒待っても終わらず、やり直すとすぐ終わった)ので、短めにする。
// 写真 4 枚の実測は無いので、正当な要求を切らないよう余裕を持たせた(最悪は 2 回分の約 70 秒)。上のログの実測がたまったら見直す
const TIMEOUT_MS = 35_000;
// 接続の失敗・時間切れのときだけ、もう 1 回呼ぶ(合計 2 回)。OpenRouter が失敗を返した場合(HTTP エラー)は、繰り返しても同じなので呼び直さない
const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 8000; // 品目 30 個の返事と、考える分（reasoning）が入る大きさ

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

// 呼び出し側がユーザー向けの文言に直せるよう、失敗の種類を分ける
export type OpenRouterErrorKind =
  | "config" // キーやモデルが未設定
  | "network" // 接続できない・時間切れ
  | "http" // OpenRouter が失敗を返した
  | "response"; // 返事の形が想定と違う

export class OpenRouterError extends Error {
  constructor(
    readonly kind: OpenRouterErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

type Options = {
  messages: ChatMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  fetchImpl?: typeof fetch; // テスト用
};

// JSON スキーマに従う返事（文字列）を 1 つ得る
export async function completeJson({ messages, schemaName, jsonSchema, fetchImpl = fetch }: Options): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) {
    throw new OpenRouterError("config", "OPENROUTER_API_KEY と OPENROUTER_MODEL を設定してください");
  }

  const requestBody = JSON.stringify({
    model,
    messages,
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: jsonSchema } },
    reasoning: { effort: "low" }, // 考える量は低めにして、出力のコストを抑える
    provider: {
      require_parameters: true, // JSON スキーマに対応しているモデルだけを使う
      data_collection: "deny", // 食事の内容と写真(健康情報)を、保持や学習に使う提供元へ送らない
    },
    max_tokens: MAX_OUTPUT_TOKENS, // 出力の上限(暴走や、課金の膨らみを抑える)
  });

  // 1 回の試行 = 送信から返事の本文の読み取りまで(時間切れの signal は、本文の読み取りにも効く。本文が止まっても、ここで切れる)。
  // OpenRouterError(失敗の返事・形が違う返事)は、呼び直しても同じなので、そのまま投げる。それ以外(接続の失敗・時間切れ・本文の途中での切断)は、呼び直す
  let body: unknown;
  for (let attempt = 1; ; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Habit and Health Tracker",
        },
        body: requestBody,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // OpenRouter が返す理由（例: 受け付けない指定）を、端末のログで原因を探せるように含める。利用者には見せない
        throw new OpenRouterError("http", `OpenRouter が ${response.status} を返しました${await errorDetail(response)}`);
      }
      try {
        body = await response.json();
      } catch (error) {
        if (error instanceof SyntaxError) throw new OpenRouterError("response", "返事が JSON ではありません");
        throw error; // 読み取り中の時間切れ・切断
      }
      // 待ち時間の実測を残す(TIMEOUT_MS を決める材料。写真の枚数別の実測はまだ無い)
      console.info(`[openrouter] ${attempt} 回目で成功: ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
      break;
    } catch (error) {
      if (error instanceof OpenRouterError) throw error;
      const reason = error instanceof Error ? error.message : "接続に失敗しました";
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (attempt >= MAX_ATTEMPTS) throw new OpenRouterError("network", reason);
      console.error(`[openrouter] ${attempt} 回目が ${seconds} 秒で失敗したので、呼び直す: ${reason}`);
    }
  }
  const parsed = responseSchema.safeParse(body);
  const content = parsed.success ? parsed.data.choices[0].message.content : null;
  if (content === null) throw new OpenRouterError("response", "返事に本文がありません");
  return content;
}

// OpenRouter の失敗の返事。提供元が拒否したときは、message が "Provider returned error" だけで、
// 本当の理由は metadata.raw（提供元の返事）に入っている
const errorBodySchema = z.object({
  error: z.object({
    message: z.string(),
    metadata: z.object({ provider_name: z.string().optional(), raw: z.unknown().optional() }).optional(),
  }),
});

const clip = (text: string) => text.slice(0, 500);

// 失敗の返事から、理由の文を取り出す（読めなければ空）。長すぎる文は切る
async function errorDetail(response: Response): Promise<string> {
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (!parsed.success) return "";
    const { message, metadata } = parsed.data.error;
    const provider = metadata?.provider_name ? `（提供元: ${metadata.provider_name}）` : "";
    // 提供元の返事(metadata.raw)には、入力(食事の内容)の一部が含まれうる。健康情報がログに残らないよう、本番では出さない
    const showRaw = process.env.NODE_ENV !== "production" && metadata?.raw !== undefined;
    const raw = !showRaw ? "" : typeof metadata?.raw === "string" ? metadata.raw : JSON.stringify(metadata?.raw);
    return `: ${clip(message)}${provider}${raw ? ` / ${clip(raw)}` : ""}`;
  } catch {
    return "";
  }
}
