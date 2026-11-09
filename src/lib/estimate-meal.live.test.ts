import { describe, expect, it, vi } from "vitest";
import { estimateMeal } from "./estimate-meal";

vi.mock("server-only", () => ({}));

// 実際の OpenRouter を 1 回呼んで、モデルが JSON スキーマどおりに返し、検証を通ることを確かめる（お金がかかる）。
// ふだんのテストでは動かない。API キーを環境変数に読み込んだうえで、RUN_LIVE_AI=1 を付けたときだけ動く:
//   RUN_LIVE_AI=1 npx vitest run estimate-meal.live
// 結果は毎回変わるので、栄養素の値は確かめず、形と範囲だけを確かめる
describe.runIf(process.env.RUN_LIVE_AI === "1" && process.env.OPENROUTER_API_KEY)("estimateMeal（実際の AI）", () => {
  it("文章から推定して、検証を通った推定が返る", { timeout: 90_000 }, async () => {
    const result = await estimateMeal({ text: "焼鮭1切れ、白ご飯茶碗1杯、わかめのみそ汁" });

    console.log(JSON.stringify(result, null, 2));
    expect(result.ok, result.ok ? "" : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.estimate.dishName.length).toBeGreaterThan(0);
    expect(result.estimate.items.length).toBeGreaterThanOrEqual(2);
    expect(result.estimate.totals.kcal).toBeGreaterThan(100);
  });
});
