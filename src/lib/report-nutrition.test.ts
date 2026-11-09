import { describe, expect, it } from "vitest";
import { buildNutritionSummary, type NutritionDay } from "./report-nutrition";

// 目標カロリー 2,000 の日: たんぱく質 82.5g(帯 79〜121%)・脂質 55.6g・糖質 287.5g・食物繊維 20g・塩分 10g(帯は、どれも 80〜120%)
const meal = (overrides: Partial<NutritionDay["meals"][number]> = {}): NutritionDay["meals"][number] => ({
  kcal: 1900,
  proteinG: "90.0",
  fatG: "55.0",
  netCarbG: "280.0",
  fiberG: "20.0",
  saltG: "10.0",
  ...overrides,
});
const day = (overrides: Partial<NutritionDay> = {}): NutritionDay => ({ meals: [meal()], baseKcal: 2000, exerciseKcal: 0, usable: true, ...overrides });
const rowOf = (summary: Record<string, unknown> | null, name: string) => (summary?.栄養素 as Record<string, unknown>[]).find((r) => r.栄養素 === name);

describe("buildNutritionSummary", () => {
  it("栄養素ごとに、範囲内・少ない・多い日数と、中央値の評価を出す", () => {
    const summary = buildNutritionSummary([
      day({ meals: [meal({ saltG: "15.0", fiberG: "10.0" })] }), // 塩分 150%(多い)、食物繊維 50%(少ない)
      day({ meals: [meal({ proteinG: "50.0", saltG: "9.0", fiberG: null })] }), // たんぱく質 61%(少ない)、食物繊維は分からない
    ]);
    expect(summary?.判定した日数).toBe(2);
    expect(rowOf(summary, "たんぱく質")).toMatchObject({ 判定した日数: 2, 目標の範囲内の日数: 1, 少ない日数: 1, 多い日数: 0 });
    expect(rowOf(summary, "塩分")).toMatchObject({ 判定した日数: 2, 目標の範囲内の日数: 1, 少ない日数: 0, 多い日数: 1 });
    // 食物繊維は、分からない食事がある日を、その軸だけ外す(1 日だけ)
    expect(rowOf(summary, "食物繊維")).toMatchObject({ 判定した日数: 1, 少ない日数: 1 });
  });

  it("中央値の評価は、日の詳細と同じ判定(塩分は、帯の上端までなら範囲内。たんぱく質は、下端に届けばよい)", () => {
    const summary = buildNutritionSummary([day({ meals: [meal({ saltG: "15.0" })] }), day({ meals: [meal({ saltG: "9.0" })] }), day({ meals: [meal({ proteinG: "50.0" })] })]);
    // 塩分: 150%・90%・100% → 中央値 100% → 範囲内。1 日は多い日
    expect(rowOf(summary, "塩分")).toMatchObject({ 目標に対する中央値の割合: 100, 中央値の評価: "目標の範囲内", 多い日数: 1 });
    // たんぱく質: 109%・109%・61% → 中央値 109% → 届いています
    expect(rowOf(summary, "たんぱく質")).toMatchObject({ 中央値の評価: "届いています", 少ない日数: 1 });
  });

  it("データがそろっていない日(データ不足・書きかけ・目標カロリー未設定・食事なし)は、数えない", () => {
    const summary = buildNutritionSummary([day(), day({ usable: false }), day({ baseKcal: null }), day({ meals: [] })]);
    expect(summary?.判定した日数).toBe(1);
  });

  it("数えられる日が 1 日も無ければ null", () => {
    expect(buildNutritionSummary([day({ usable: false })])).toBeNull();
    expect(buildNutritionSummary([])).toBeNull();
  });

  it("運動の分は、カロリー・脂質・糖質の目標に足す(たんぱく質は足さない)", () => {
    // 運動 +500 kcal(目標 2,500): 脂質の 100% は 69.4g。55g は 79% で、範囲の下端(80%)を下回る
    const summary = buildNutritionSummary([day({ exerciseKcal: 500 })]);
    expect(rowOf(summary, "脂質")).toMatchObject({ 少ない日数: 1 });
    expect(rowOf(summary, "たんぱく質")).toMatchObject({ 少ない日数: 0 }); // 90g は 82.5g(運動を足さない)の 109%
  });
});
