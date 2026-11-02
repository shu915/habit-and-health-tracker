import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateMeal, IMAGE_MAX_LENGTH, MAX_PHOTOS, TEXT_MAX_LENGTH } from "./estimate-meal";
import { OpenRouterError, type completeJson } from "./openrouter";

vi.mock("server-only", () => ({}));

type Complete = typeof completeJson;

const goodReply = JSON.stringify({
  isMeal: true,
  notMealReason: "",
  dishName: "焼鮭定食",
  description: "焼鮭と白ご飯",
  items: [
    { name: "焼鮭", amount: "1切れ 80g", kcal: 200, proteinG: 22, fatG: 11, carbohydrateG: 0.1, fiberG: 0, saltG: 1.5 },
    { name: "白ご飯", amount: "150g", kcal: 250, proteinG: 3.8, fatG: 0.5, carbohydrateG: 55.7, fiberG: 0.5, saltG: 0 },
  ],
});

const fakeComplete = (content: string = goodReply) => vi.fn<Complete>(async () => content);

// 先頭バイトが本物の形式のもの（中身は短いダミー）
const bytes = (...values: number[]) => Buffer.from(values).toString("base64");
const PNG = `data:image/png;base64,${bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)}`;
const JPEG = `data:image/jpeg;base64,${bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)}`;
// 別の写真(先頭バイトは本物の JPEG で、中身が違う)。同じ写真は 1 枚にまとめられるので、枚数を数えるテストでは、別の写真を使う
const distinctJpeg = (n: number) => `data:image/jpeg;base64,${bytes(0xff, 0xd8, 0xff, 0xe0, n, n)}`;
const WEBP = `data:image/webp;base64,${Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]).toString("base64")}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimateMeal", () => {
  it("文章から推定する: system と user のメッセージで、JSON スキーマ付きで呼ぶ", async () => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "焼鮭定食" }, complete);

    expect(result.ok && result.estimate.totals.kcal).toBe(450);
    const call = complete.mock.calls[0][0];
    expect(call.schemaName).toBe("meal_estimate");
    expect(call.jsonSchema.type).toBe("object");
    expect(call.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(call.messages[1].content).toContain("焼鮭定食");
  });

  it("過去の料理名の一覧を AI に渡し、返事の料理名もそれにそろえる", async () => {
    const complete = fakeComplete(goodReply.replace("焼鮭定食", "焼鮭 定食"));
    const result = await estimateMeal({ text: "焼鮭定食", knownDishNames: ["カレー", "焼鮭定食"] }, complete);

    expect(complete.mock.calls[0][0].messages[1].content).toContain("- カレー");
    expect(result.ok && result.estimate.dishName).toBe("焼鮭定食");
  });

  it("写真を付けると、user のメッセージに画像の部分が入る（文章が空でもよい）", async () => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "", imageDataUrls: [PNG] }, complete);

    expect(result.ok).toBe(true);
    const content = complete.mock.calls[0][0].messages[1].content;
    expect(Array.isArray(content) && content.map((part) => part.type)).toEqual(["text", "image_url"]);
    expect(Array.isArray(content) && content[1]).toEqual({ type: "image_url", image_url: { url: PNG } });
  });

  it("写真は最大 4 枚まで、順に、画像の部分として付く", async () => {
    const complete = fakeComplete();
    const photos = [PNG, JPEG, WEBP, distinctJpeg(9)];
    const result = await estimateMeal({ text: "定食", imageDataUrls: photos }, complete);

    expect(result.ok).toBe(true);
    const content = complete.mock.calls[0][0].messages[1].content;
    expect(Array.isArray(content) && content.map((part) => part.type)).toEqual(["text", "image_url", "image_url", "image_url", "image_url"]);
    expect(Array.isArray(content) && content.slice(1)).toEqual(photos.map((url) => ({ type: "image_url", image_url: { url } })));
  });

  it("同じ写真(完全に同じ内容)を何枚付けても、1 枚にまとめて、1 回分として渡す(順序は保つ)", async () => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "これ 4 人前食べた", imageDataUrls: [PNG, PNG, PNG, PNG] }, complete);

    expect(result.ok).toBe(true);
    const content = complete.mock.calls[0][0].messages[1].content;
    expect(Array.isArray(content) && content.map((part) => part.type)).toEqual(["text", "image_url"]);

    const mixed = fakeComplete();
    await estimateMeal({ text: "x", imageDataUrls: [PNG, JPEG, PNG, JPEG, WEBP] }, mixed);
    const parts = mixed.mock.calls[0][0].messages[1].content;
    expect(Array.isArray(parts) && parts.slice(1)).toEqual([PNG, JPEG, WEBP].map((url) => ({ type: "image_url", image_url: { url } })));
  });

  it("同じ写真は、まとめてから枚数を数える(同じ写真が 5 枚あっても、1 枚として通る)", async () => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "x", imageDataUrls: Array.from({ length: MAX_PHOTOS + 1 }, () => PNG) }, complete);
    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("写真が 5 枚以上なら、AI を呼ばずに失敗にする", async () => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "定食", imageDataUrls: Array.from({ length: MAX_PHOTOS + 1 }, (_, n) => distinctJpeg(n)) }, complete);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("4 枚までです");
    expect(complete).not.toHaveBeenCalled();
  });

  it("4 枚とも 1 枚の上限ちょうどでも通り、1 文字でも超えた 1 枚があれば、AI を呼ばずに失敗にする", async () => {
    const big = PNG + "A".repeat(IMAGE_MAX_LENGTH - PNG.length);
    expect(big.length).toBe(IMAGE_MAX_LENGTH);
    expect((await estimateMeal({ text: "x", imageDataUrls: Array.from({ length: MAX_PHOTOS }, () => big) }, fakeComplete())).ok).toBe(true);

    const complete = fakeComplete();
    const result = await estimateMeal({ text: "x", imageDataUrls: [PNG, big + "A"] }, complete);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("大きすぎます");
    expect(complete).not.toHaveBeenCalled();
  });

  it("4 枚 × 1 枚の上限が、Server Action の本文の上限(4MB)に収まる", () => {
    expect(MAX_PHOTOS).toBe(4);
    expect(MAX_PHOTOS * IMAGE_MAX_LENGTH).toBeLessThan(4 * 1024 * 1024);
  });

  it.each([
    ["JPEG", JPEG],
    ["PNG", PNG],
    ["WebP", WEBP],
  ])("本物の %s の先頭バイトなら受け付ける", async (_label, imageDataUrl) => {
    expect((await estimateMeal({ text: "x", imageDataUrls: [imageDataUrl] }, fakeComplete())).ok).toBe(true);
  });

  it.each([
    ["PNG と宣言して、中身が JPEG", PNG.replace(/base64,.*/, `base64,${bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)}`)],
    ["JPEG と宣言して、中身が文字", `data:image/jpeg;base64,${Buffer.from("<html>not an image</html>").toString("base64")}`],
    ["WebP と宣言して、RIFF だけで WEBP が無い", `data:image/webp;base64,${Buffer.from("RIFF0000AVI LIST").toString("base64")}`],
  ])("宣言と中身が合わない写真は、AI を呼ばずに失敗にする: %s", async (_label, imageDataUrl) => {
    const complete = fakeComplete();
    const result = await estimateMeal({ text: "x", imageDataUrls: [imageDataUrl] }, complete);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("形式が正しくありません");
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ["文章も写真も無い", { text: "  " }, "食べたものを入力するか"],
    ["文章が長すぎる", { text: "あ".repeat(TEXT_MAX_LENGTH + 1) }, "文字までです"],
    ["写真が画像ではない", { text: "x", imageDataUrls: ["data:text/html;base64,AAAA"] }, "JPEG・PNG・WebP"],
    ["写真が http の URL", { text: "x", imageDataUrls: ["https://example.com/a.png"] }, "JPEG・PNG・WebP"],
    ["写真が大きすぎる", { text: "x", imageDataUrls: [`data:image/png;base64,${"A".repeat(IMAGE_MAX_LENGTH)}`] }, "大きすぎます"],
  ])("入力が不正なら、AI を呼ばずに失敗にする: %s", async (_label, input, message) => {
    const complete = fakeComplete();
    const result = await estimateMeal(input, complete);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ["config", "設定が済んでいません"],
    ["network", "接続できませんでした"],
    ["http", "エラーを返しました"],
    ["response", "読み取れませんでした"],
  ] as const)("AI の呼び出しが %s で失敗したら、保存せずに利用者向けの文言で失敗にする", async (kind, message) => {
    const complete = vi.fn<Complete>(async () => {
      throw new OpenRouterError(kind, "内部の詳しい理由 sk-secret");
    });
    const result = await estimateMeal({ text: "焼鮭" }, complete);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(message);
      expect(result.message).not.toContain("sk-secret"); // 内部の理由は利用者に見せない
    }
  });

  it("食べ物でない入力(AI が isMeal を false で返した)は、推定を返さず、理由つきの失敗にする", async () => {
    const reply = JSON.stringify({ isMeal: false, notMealReason: "革靴は食べ物ではないため", dishName: "", description: "", items: [] });
    const result = await estimateMeal({ text: "革靴を煮て食べた" }, fakeComplete(reply));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("革靴は食べ物ではないため");
  });

  it("AI の返事が検証を通らなければ、失敗にする", async () => {
    const result = await estimateMeal({ text: "焼鮭" }, fakeComplete('{"dishName":"x"}'));
    expect(result.ok).toBe(false);
  });

  it("OpenRouterError 以外の例外（プログラムの誤り）は隠さずに投げる", async () => {
    const complete = vi.fn<Complete>(async () => {
      throw new TypeError("bug");
    });
    await expect(estimateMeal({ text: "焼鮭" }, complete)).rejects.toThrow("bug");
  });
});
