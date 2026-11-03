import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, it, vi } from "vitest";
import { estimateMeal } from "./estimate-meal";

vi.mock("server-only", () => ({}));

// 写真つきの推定を、複数のモデルで比べる道具（お金がかかる。RUN_LIVE_AI=1 と API キーが無ければ動かないので、CI では動かない）。
// 指定したフォルダの写真（JPEG・PNG・WebP）を 1 枚ずつ推定する。文章は PHOTO_TEXT で付けられる（無ければ写真だけ）。
// RUN_LIVE_AI=1 と PHOTO_DIR が必要:
//   PHOTO_DIR=/Users/.../meal-photos PHOTO_TEXT="ホテルで食べた鮭の定食" RUN_LIVE_AI=1 npx vitest run estimate-meal.photo
// 写真は OpenRouter 経由でモデルの提供元に送られる（このアプリには保存しない）。API キーは表示しない
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_BYTES = 5_500_000; // data URL の上限（8,000,000 文字）に収まる大きさ

const photoDir = process.env.PHOTO_DIR;
const photoText = process.env.PHOTO_TEXT ?? "";
const models = (process.env.OPENROUTER_COMPARE_MODELS ?? "google/gemini-3.8-flash,anthropic/claude-sonnet-5.5")
  .split(",")
  .map((model) => model.trim())
  .filter((model) => model !== "");

describe.runIf(process.env.RUN_LIVE_AI === "1" && process.env.OPENROUTER_API_KEY && photoDir)("写真の推定の比較", () => {
  it("フォルダの写真を、複数のモデルで推定して比べる", { timeout: 900_000 }, async () => {
    const dir = photoDir ?? "";
    const files = readdirSync(dir)
      .filter((name) => extname(name).toLowerCase() in MIME)
      .sort();
    console.log(`写真 ${files.length} 枚 / 文章: ${photoText === "" ? "なし" : `「${photoText}」`} / 比べるモデル: ${models.join(" / ")}\n`);

    const original = process.env.OPENROUTER_MODEL;
    try {
      for (const name of files) {
        const path = join(dir, name);
        const bytes = statSync(path).size;
        if (bytes > MAX_BYTES) {
          console.log(`■ ${name}: 大きすぎるので飛ばします（${(bytes / 1_000_000).toFixed(1)}MB。5.5MB 以下にしてください）\n`);
          continue;
        }
        const imageDataUrl = `data:${MIME[extname(name).toLowerCase()]};base64,${readFileSync(path).toString("base64")}`;

        const lines = [`■ ${name}（${(bytes / 1_000_000).toFixed(1)}MB）`];
        for (const model of models) {
          process.env.OPENROUTER_MODEL = model;
          const started = Date.now();
          const result = await estimateMeal({ text: photoText, imageDataUrls: [imageDataUrl] });
          const seconds = ((Date.now() - started) / 1000).toFixed(1);

          if (!result.ok) {
            lines.push(`  ${model}: 失敗（${seconds} 秒）${result.message}`);
            continue;
          }
          const { dishName, description, items, totals } = result.estimate;
          lines.push(
            `  ${model}（${seconds} 秒）${dishName}: ${totals.kcal} kcal / P ${totals.proteinG} F ${totals.fatG} 糖質 ${totals.netCarbG} 繊維 ${totals.fiberG ?? "-"} 塩 ${totals.saltG ?? "-"}`,
            `      説明: ${description}`,
            ...items.map((item) => `      - ${item.name}（${item.amount}）${item.kcal} kcal`),
          );
        }
        console.log(lines.join("\n") + "\n");
      }
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = original;
    }
  });
});
