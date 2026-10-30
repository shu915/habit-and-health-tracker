import { describe, expect, it } from "vitest";
import {
  basalMetabolicRate,
  bmi,
  dailyEnergy,
  MIN_CALORIES,
  standardWeightKg,
  suggestTargetCalories,
  suggestTargetProtein,
  suggestTargetWeight,
  type BodyData,
} from "./nutrition";

// ユーザー本人に近い例: 39 歳・男性・176cm・98.3kg・体脂肪率 32%
const body: BodyData = { gender: "male", age: 39, heightCm: 176, weightKg: 98.3, bodyFatPercent: 32 };

describe("basalMetabolicRate", () => {
  it("体脂肪率があれば Katch-McArdle 式(370 + 21.6 × 除脂肪体重)", () => {
    // 除脂肪体重 98.3 × 0.68 = 66.844 → 370 + 21.6 × 66.844 = 1813.8
    expect(basalMetabolicRate(body)).toEqual({ ok: true, kcal: 1814, method: "katch-mcardle" });
  });

  it("体脂肪率があれば、性別・年齢・身長が無くても出せる", () => {
    const result = basalMetabolicRate({ gender: null, age: null, heightCm: null, weightKg: 98.3, bodyFatPercent: 32 });
    expect(result).toEqual({ ok: true, kcal: 1814, method: "katch-mcardle" });
  });

  it("体脂肪率が無ければ Mifflin-St Jeor 式(男性 +5)", () => {
    // 10×98.3 + 6.25×176 − 5×39 + 5 = 983 + 1100 − 195 + 5
    expect(basalMetabolicRate({ ...body, bodyFatPercent: null })).toEqual({
      ok: true,
      kcal: 1893,
      method: "mifflin-st-jeor",
    });
  });

  it("女性は −161、その他は男女の中間(−78)", () => {
    const base = { ...body, bodyFatPercent: null };
    expect(basalMetabolicRate({ ...base, gender: "female" })).toMatchObject({ kcal: 1727 });
    expect(basalMetabolicRate({ ...base, gender: "other" })).toMatchObject({ kcal: 1810 });
  });

  it("足りない項目を、日本語で全部返す", () => {
    expect(basalMetabolicRate({ ...body, bodyFatPercent: null, heightCm: null, gender: null })).toEqual({
      ok: false,
      missing: ["身長", "性別"],
    });
    expect(basalMetabolicRate({ gender: null, age: null, heightCm: null, weightKg: null, bodyFatPercent: null })).toEqual({
      ok: false,
      missing: ["体重"],
    });
    expect(basalMetabolicRate({ gender: "male", age: null, heightCm: 170, weightKg: 70, bodyFatPercent: null })).toEqual({
      ok: false,
      missing: ["年齢"],
    });
  });
});

describe("dailyEnergy", () => {
  it("基礎代謝 × 活動係数を、整数に丸める", () => {
    expect(dailyEnergy(1814, 1.375)).toBe(2494);
    expect(dailyEnergy(1814, 1.2)).toBe(2177);
  });
});

describe("bmi / standardWeightKg", () => {
  it("BMI と標準体重(BMI 22)", () => {
    expect(bmi(98.3, 176)).toBeCloseTo(31.73, 2);
    expect(standardWeightKg(176)).toBeCloseTo(68.15, 2);
  });
});

describe("suggestTargetWeight", () => {
  it("BMI 25 以上なら、現在の 5% 減(0.5kg 単位に丸める)", () => {
    expect(suggestTargetWeight(98.3, 176)).toEqual({ kg: 93.5, reason: "reduce" }); // 98.3 × 0.95 = 93.385
    expect(suggestTargetWeight(100, 170)).toEqual({ kg: 95, reason: "reduce" });
  });

  it("BMI 25 未満なら、現在の体重を維持", () => {
    expect(suggestTargetWeight(70, 175)).toEqual({ kg: 70, reason: "maintain" }); // BMI 22.9
    expect(suggestTargetWeight(60, 175)).toEqual({ kg: 60, reason: "maintain" });
  });

  it("境界: BMI 25 のすぐ上は減らす側、すぐ下は維持(ちょうど 25 は浮動小数点の誤差で不安定なので、少し離して確かめる)", () => {
    const height = 170;
    const weightAt = (bmiValue: number) => bmiValue * (height / 100) ** 2;
    expect(suggestTargetWeight(weightAt(25.05), height).reason).toBe("reduce");
    expect(suggestTargetWeight(weightAt(24.95), height).reason).toBe("maintain");
  });

  it("5% 減は、BMI 25 の人でも標準体重(BMI 22)を下回らない(下限が不要なことの確認)", () => {
    for (const height of [150, 160, 170, 180, 190]) {
      const weight = 25 * (height / 100) ** 2;
      expect(suggestTargetWeight(weight, height).kg).toBeGreaterThan(standardWeightKg(height));
    }
  });
});

describe("suggestTargetCalories", () => {
  it("目標体重で釣り合うカロリー(目標体重での消費)を、50 kcal 単位に丸める", () => {
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 2494 })).toEqual({ kcal: 2500, reason: "balance" }); // 49.88 → 50 単位
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 2374 })).toEqual({ kcal: 2350, reason: "balance" }); // 47.48 → 47 単位
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 2025 })).toEqual({ kcal: 2050, reason: "balance" }); // 丸めの境界(四捨五入)
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 2024 })).toEqual({ kcal: 2000, reason: "balance" });
  });

  it("絶対的な下限(1200 kcal)を下回らない", () => {
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 1105 })).toEqual({ kcal: MIN_CALORIES, reason: "floor-min" });
    expect(suggestTargetCalories({ tdeeAtTargetKcal: 1200 })).toEqual({ kcal: 1200, reason: "balance" });
  });
});

describe("suggestTargetProtein", () => {
  it("目標体重 × 1.4 g/kg を整数に丸める", () => {
    expect(suggestTargetProtein(93.5)).toBe(131); // 130.76
    expect(suggestTargetProtein(70)).toBe(98);
  });
});
