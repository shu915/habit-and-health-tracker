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
  it("BMI 25 以上なら、現在の 5% 減(小数 1 桁)", () => {
    expect(suggestTargetWeight(98.3, 176)).toEqual({ kg: 93.4, reason: "reduce" }); // 98.3 × 0.95 = 93.385
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
  it("減らす目標なら、消費カロリーから 15% 減(10 kcal 単位)", () => {
    // 2494 × 0.85 = 2119.9 → 2120。基礎代謝 1814 より上
    expect(suggestTargetCalories({ bmrKcal: 1814, tdeeKcal: 2494, weightKg: 98.3, targetWeightKg: 93.4 })).toEqual({
      kcal: 2120,
      reason: "deficit",
    });
  });

  it("目標体重が現在以上なら、消費カロリーと同じ(維持)", () => {
    expect(suggestTargetCalories({ bmrKcal: 1814, tdeeKcal: 2494, weightKg: 70, targetWeightKg: 70 })).toEqual({
      kcal: 2490,
      reason: "maintain",
    });
    expect(suggestTargetCalories({ bmrKcal: 1814, tdeeKcal: 2494, weightKg: 70, targetWeightKg: 75 }).reason).toBe("maintain");
  });

  it("基礎代謝を下回らない(下回る場合は基礎代謝まで引き上げる)", () => {
    // 1800 × 0.85 = 1530 < 基礎代謝 1600
    expect(suggestTargetCalories({ bmrKcal: 1600, tdeeKcal: 1800, weightKg: 80, targetWeightKg: 76 })).toEqual({
      kcal: 1600,
      reason: "floor-bmr",
    });
  });

  it("下限に合わせるときは切り上げる(基礎代謝を下回らない)", () => {
    // 基礎代謝 1604 → 四捨五入だと 1600 で下回る。切り上げて 1610
    const result = suggestTargetCalories({ bmrKcal: 1604, tdeeKcal: 1800, weightKg: 80, targetWeightKg: 76 });
    expect(result).toEqual({ kcal: 1610, reason: "floor-bmr" });
    expect(result.kcal).toBeGreaterThanOrEqual(1604);
  });

  it("基礎代謝が低い人でも、絶対的な下限(1200 kcal)を下回らない", () => {
    // 1300 × 0.85 = 1105 < 1200。基礎代謝 1000 も 1200 より低い
    expect(suggestTargetCalories({ bmrKcal: 1000, tdeeKcal: 1300, weightKg: 55, targetWeightKg: 52 })).toEqual({
      kcal: MIN_CALORIES,
      reason: "floor-min",
    });
  });
});

describe("suggestTargetProtein", () => {
  it("目標体重 × 1.4 g/kg を整数に丸める", () => {
    expect(suggestTargetProtein(93.4)).toBe(131); // 130.76
    expect(suggestTargetProtein(70)).toBe(98);
  });
});
