import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeJson, OpenRouterError } from "./openrouter";

vi.mock("server-only", () => ({}));

const options = {
  messages: [{ role: "user" as const, content: "こんにちは" }],
  schemaName: "test_schema",
  jsonSchema: { type: "object" },
};

const reply = (content: string | null) => ({ choices: [{ message: { content } }] });
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// 呼ばれた fetch の引数（URL とリクエスト）を取り出す
function sentRequest(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

async function failureOf(promise: Promise<unknown>): Promise<OpenRouterError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof OpenRouterError)) throw new Error(`OpenRouterError ではない: ${String(error)}`);
  return error;
}

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test/model");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("completeJson", () => {
  it("返事の本文（文字列）を返す", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(reply('{"a":1}')));
    expect(await completeJson({ ...options, fetchImpl })).toBe('{"a":1}');
  });

  it("OpenRouter へ、環境変数のモデルとキー、JSON スキーマを付けて POST する", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(reply("{}")));
    await completeJson({ ...options, fetchImpl });

    const { url, init, body } = sentRequest(fetchImpl);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(body.model).toBe("test/model");
    expect(body.messages).toEqual(options.messages);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "test_schema", strict: true, schema: { type: "object" } },
    });
    expect(body.reasoning).toEqual({ effort: "low" });
    // 食事の内容と写真(健康情報)を、保持・学習に使う提供元へ送らない
    expect(body.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(body.max_tokens).toBe(8000);
  });

  it("モデルを環境変数で切り替えられる", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "anthropic/other");
    const fetchImpl = vi.fn(async () => jsonResponse(reply("{}")));
    await completeJson({ ...options, fetchImpl });
    expect(sentRequest(fetchImpl).body.model).toBe("anthropic/other");
  });

  it.each([["OPENROUTER_API_KEY"], ["OPENROUTER_MODEL"]])("%s が未設定なら、送信せずに config エラー", async (name) => {
    vi.stubEnv(name, "");
    const fetchImpl = vi.fn(async () => jsonResponse(reply("{}")));
    const error = await failureOf(completeJson({ ...options, fetchImpl }));
    expect(error.kind).toBe("config");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("接続に失敗したら network エラー", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await failureOf(completeJson({ ...options, fetchImpl }))).kind).toBe("network");
  });

  it("時間切れ（AbortSignal）も network エラー", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect((await failureOf(completeJson({ ...options, fetchImpl }))).kind).toBe("network");
  });

  it("リクエストには時間切れの signal を付ける", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(reply("{}")));
    await completeJson({ ...options, fetchImpl });
    expect(sentRequest(fetchImpl).init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([[400], [401], [402], [429], [500]])("HTTP %i は http エラー（OpenRouter が返した理由を含め、キーは含めない）", async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "unsupported parameter: reasoning" } }, status));
    const error = await failureOf(completeJson({ ...options, fetchImpl }));
    expect(error.kind).toBe("http");
    expect(error.message).toContain(String(status));
    expect(error.message).toContain("unsupported parameter: reasoning");
    expect(error.message).not.toContain("test-key");
  });

  it("失敗の返事が JSON でなくても、http エラーになる（理由は空）", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const error = await failureOf(completeJson({ ...options, fetchImpl }));
    expect(error.kind).toBe("http");
    expect(error.message).toBe("OpenRouter が 502 を返しました");
  });

  it("提供元が拒否したときは、metadata の提供元の名前と本当の理由（文字列でも JSON でも）を含める", async () => {
    const asString = vi.fn(async () =>
      jsonResponse(
        { error: { message: "Provider returned error", metadata: { provider_name: "Google AI Studio", raw: "Invalid JSON payload: unknown field" } } },
        400,
      ),
    );
    const error1 = await failureOf(completeJson({ ...options, fetchImpl: asString }));
    expect(error1.message).toContain("Provider returned error");
    expect(error1.message).toContain("Google AI Studio");
    expect(error1.message).toContain("Invalid JSON payload: unknown field");

    const asObject = vi.fn(async () =>
      jsonResponse({ error: { message: "Provider returned error", metadata: { raw: { code: 400, status: "INVALID_ARGUMENT" } } } }, 400),
    );
    const error2 = await failureOf(completeJson({ ...options, fetchImpl: asObject }));
    expect(error2.message).toContain("INVALID_ARGUMENT");
  });

  it("本番では、提供元の返事(metadata.raw。入力の一部を含みうる)をログ用の文面に入れない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { message: "Provider returned error", metadata: { provider_name: "Google AI Studio", raw: "入力の食事内容: 焼鮭" } } },
        400,
      ),
    );
    const error = await failureOf(completeJson({ ...options, fetchImpl }));
    expect(error.message).toContain("Google AI Studio");
    expect(error.message).not.toContain("焼鮭");
    expect(error.message).not.toContain("入力の食事内容");
  });

  it("長すぎる理由は 500 文字で切る", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "x".repeat(2000) } }, 400));
    const error = await failureOf(completeJson({ ...options, fetchImpl }));
    expect(error.message.length).toBeLessThan(600);
  });

  it.each([
    ["JSON ではない本文", () => new Response("<html>bad gateway</html>", { status: 200 })],
    ["choices が空", () => jsonResponse({ choices: [] })],
    ["choices が無い", () => jsonResponse({})],
    ["本文が null（モデルが何も返さなかった）", () => jsonResponse(reply(null))],
    ["本文が文字列ではない", () => jsonResponse({ choices: [{ message: { content: { a: 1 } } }] })],
  ])("返事の形が想定と違うときは response エラー: %s", async (_label, make) => {
    const fetchImpl = vi.fn(async () => make());
    expect((await failureOf(completeJson({ ...options, fetchImpl }))).kind).toBe("response");
  });
});
