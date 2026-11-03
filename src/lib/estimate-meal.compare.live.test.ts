import { describe, it, vi } from "vitest";
import { estimateMeal } from "./estimate-meal";

vi.mock("server-only", () => ({}));

// モデルを比べるための道具（お金がかかる。RUN_LIVE_AI=1 と API キーが無ければ動かないので、CI では動かない）。
// 同じ食事を、複数のモデルで順に推定して、1 食ごとに結果を出す。RUN_LIVE_AI=1 のときだけ動く:
//   RUN_LIVE_AI=1 npx vitest run estimate-meal.compare
// 比べるモデルは OPENROUTER_COMPARE_MODELS（カンマ区切り）で変えられる。API キーは表示しない
//
// 「目安」は、人が見比べるための私の概算（日本食品標準成分表などからの大まかな値）で、正解ではない。
// 目安から大きく外れていないか、品目の中身（食物繊維など）が常識的かを見る
const MEALS: { label: string; text: string; roughKcal: string }[] = [
  { label: "1 定食（基準）", text: "焼鮭1切れ、白ご飯茶碗1杯、わかめのみそ汁", roughKcal: "約 430" },
  { label: "2 自炊・量の記載なし", text: "豚肉とキャベツの味噌炒め、ご飯、冷奴", roughKcal: "約 650" },
  { label: "3 外食（チェーン）", text: "牛丼並盛り、みそ汁", roughKcal: "約 700" },
  { label: "4 コンビニ・あいまい", text: "コンビニのおにぎり2個とサラダチキン", roughKcal: "約 480" },
  { label: "5 量が多い", text: "ラーメン大盛り、半チャーハン、餃子5個", roughKcal: "約 1300" },
  { label: "6 軽食", text: "バナナ1本とヨーグルト", roughKcal: "約 150" },
  { label: "7 名前のない自炊", text: "冷蔵庫の残りで作った野菜炒め、卵2個、ご飯大盛り", roughKcal: "約 800" },
  { label: "8 お酒とつまみ", text: "ビール500ml、焼き鳥5本（塩）、枝豆", roughKcal: "約 600" },
];

const models = (process.env.OPENROUTER_COMPARE_MODELS ?? "google/gemini-3.8-flash,anthropic/claude-sonnet-5.5")
  .split(",")
  .map((model) => model.trim())
  .filter((model) => model !== "");

describe.runIf(process.env.RUN_LIVE_AI === "1" && process.env.OPENROUTER_API_KEY)("モデルの比較", () => {
  it("同じ食事を、複数のモデルで推定して比べる", { timeout: 900_000 }, async () => {
    const original = process.env.OPENROUTER_MODEL;
    console.log(`比べるモデル: ${models.join(" / ")}\n（「目安」は私の概算で、正解ではありません）\n`);

    try {
      for (const meal of MEALS) {
        const lines = [`■ ${meal.label}「${meal.text}」 目安 ${meal.roughKcal} kcal`];
        for (const model of models) {
          process.env.OPENROUTER_MODEL = model; // openrouter.ts は呼び出しのたびに読む
          const started = Date.now();
          const result = await estimateMeal({ text: meal.text });
          const seconds = ((Date.now() - started) / 1000).toFixed(1);

          if (!result.ok) {
            lines.push(`  ${model}: 失敗（${seconds} 秒）${result.message}`);
            continue;
          }
          const { dishName, items, totals } = result.estimate;
          lines.push(
            `  ${model}（${seconds} 秒）${dishName}: ${totals.kcal} kcal / P ${totals.proteinG} F ${totals.fatG} 糖質 ${totals.netCarbG} 繊維 ${totals.fiberG ?? "-"} 塩 ${totals.saltG ?? "-"}`,
            ...items.map(
              (item) => `      - ${item.name}（${item.amount}）${item.kcal} kcal, 炭水化物 ${item.carbohydrateG}, 繊維 ${item.fiberG ?? "-"}`,
            ),
          );
        }
        console.log(lines.join("\n") + "\n"); // 1 食ごとに出す（止まって見えないように）
      }
    } finally {
      if (original === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = original;
    }
  });
});
