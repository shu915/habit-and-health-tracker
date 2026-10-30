import { describe, expect, it } from "vitest";
import { energySummary, suggestTargets, SUGGESTABLE_FIELDS, type FormValues } from "./profile-suggest";

// ユーザー本人に近い例: 39 歳・男性・176cm・98.3kg・体脂肪率 32%・活動係数 1.375(軽い)
const full: FormValues = {
  gender: "male",
  age: "39",
  heightCm: "176",
  currentWeightKg: "98.3",
  currentBodyFatPercent: "32",
  activityLevel: "1.375",
};

describe("energySummary", () => {
  it("基礎代謝と、活動係数を掛けた消費カロリーの目安を出す", () => {
    expect(energySummary(full)).toEqual({
      ok: true,
      bmrKcal: 1814,
      method: "katch-mcardle",
      activityLevel: 1.375,
      tdeeKcal: 2494,
    });
  });

  it("体脂肪率が無ければ Mifflin-St Jeor 式になる", () => {
    expect(energySummary({ ...full, currentBodyFatPercent: "" })).toMatchObject({
      ok: true,
      bmrKcal: 1893,
      method: "mifflin-st-jeor",
      tdeeKcal: 2603,
    });
  });

  it("活動係数が未選択なら、消費カロリーは null(基礎代謝だけ出す)", () => {
    expect(energySummary({ ...full, activityLevel: "" })).toMatchObject({ ok: true, bmrKcal: 1814, tdeeKcal: null });
  });

  it("足りない項目を返す。読めない値や選択肢にない活動係数は、未入力として扱う", () => {
    expect(energySummary({ ...full, currentBodyFatPercent: "", heightCm: "abc", gender: "x" })).toEqual({
      ok: false,
      missing: ["身長", "性別"],
    });
    expect(energySummary({ ...full, activityLevel: "1.45" })).toMatchObject({ ok: true, tdeeKcal: null });
    expect(energySummary({})).toEqual({ ok: false, missing: ["体重"] });
  });
});

describe("範囲外の入力", () => {
  it("現実的な範囲(profile-limits.ts の app)の外の値は、未入力として扱う", () => {
    // 身長 0・体脂肪率 150%・年齢 500 のまま計算して、変な値を出さない
    expect(energySummary({ ...full, currentBodyFatPercent: "150", heightCm: "0", age: "500" })).toEqual({
      ok: false,
      missing: ["身長", "年齢"],
    });
    expect(energySummary({ ...full, currentBodyFatPercent: "2" })).toMatchObject({ method: "mifflin-st-jeor" }); // 3% 未満は体重計の値として不自然
  });

  it("身長が範囲外なら、目標体重は提案せず、理由を出す(Infinity の BMI で 5% 減を出さない)", () => {
    const result = suggestTargets({ ...full, heightCm: "0" }, ["targetWeightKg"]);
    expect(result.values).toEqual({});
    expect(result.errors.targetWeightKg).toContain("現在の体重と身長");
  });

  it("入力済みの目標体重が範囲外なら、「空なので仮定」とは言わず、理由を出して提案しない", () => {
    const result = suggestTargets({ ...full, targetWeightKg: "5" }, ["targetCalories", "targetProteinG"]);
    expect(result.values).toEqual({});
    expect(result.errors.targetCalories).toContain("目標体重の値（5）は使えません");
    expect(result.errors.targetProteinG).toContain("20〜300kg");
    expect(result.notes).toEqual({});
  });
});

describe("suggestTargets", () => {
  it("3 つとも提案する(目標体重 → カロリー → タンパク質の順に、前の結果を使う)", () => {
    const result = suggestTargets(full, SUGGESTABLE_FIELDS);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ targetWeightKg: "93.5", targetCalories: "2400", targetProteinG: "131" });
    expect(result.notes.targetWeightKg).toContain("5% 減");
    // 目標体重 93.5kg・体脂肪率 32% → 除脂肪体重 63.58kg → 基礎代謝 1743 × 1.375 = 2397 → 2400
    expect(result.notes.targetCalories).toContain("目標体重 93.5kg で釣り合うカロリー（基礎代謝 1743 × 1.375 = 2397 kcal）");
    expect(result.notes.targetProteinG).toContain("93.5kg × 1.4 g/kg");
    // 現在の体重での消費 2494 kcal との差(2494 − 2400)
    expect(result.notes.targetCalories).toContain("現在の体重での消費 2494 kcal より、94 kcal 少ない量です");
  });

  it("選んだ項目だけを提案する(選ばなかった項目は触らない)", () => {
    const result = suggestTargets(full, ["targetCalories"]);
    expect(Object.keys(result.values)).toEqual(["targetCalories"]);
    expect(Object.keys(result.notes)).toEqual(["targetCalories"]);
  });

  it("本人が入れた目標体重を使う(チェックを外した項目は上書きしない)", () => {
    // 目標体重 85kg を自分で入れて、カロリーとタンパク質だけ提案
    const result = suggestTargets({ ...full, targetWeightKg: "85" }, ["targetCalories", "targetProteinG"]);
    expect(result.values).toEqual({ targetCalories: "2250", targetProteinG: "119" }); // 85 × 1.4 = 119。カロリーは 85kg の基礎代謝 1618 × 1.375 = 2225 → 2250
    expect(result.notes.targetProteinG).toBe("目標体重 85kg × 1.4 g/kg");
  });

  it("目標体重が空のまま、カロリーだけを提案するときは、5% 減の目標体重を仮定して、そう表示する", () => {
    const result = suggestTargets(full, ["targetCalories"]);
    expect(result.values.targetCalories).toBe("2400");
    expect(result.notes.targetCalories).toContain("目標体重が空なので、93.5kg を仮定");
  });

  it("目標体重が現在と同じなら、カロリーは今の消費と同じ(維持)", () => {
    const result = suggestTargets({ ...full, targetWeightKg: "98.3" }, ["targetCalories"]);
    expect(result.values.targetCalories).toBe("2500");
    expect(result.notes.targetCalories).toContain("基礎代謝 1814 × 1.375 = 2494 kcal");
    expect(result.notes.targetCalories).toContain("現在の体重での消費 2494 kcal とほぼ同じ量です"); // 50 kcal 単位に丸めて 2500(差は 6 kcal)
  });

  it("目標体重が現在より重くても、目標体重で釣り合うカロリーを出す(増量の目標)", () => {
    // 目標体重 105kg・体脂肪率 32% → 除脂肪体重 71.4kg → 基礎代謝 1912 × 1.375 = 2629 → 2650
    const result = suggestTargets({ ...full, targetWeightKg: "105" }, ["targetCalories"]);
    expect(result.values.targetCalories).toBe("2650");
    expect(result.notes.targetCalories).toContain("目標体重 105kg で釣り合うカロリー（基礎代謝 1912 × 1.375 = 2629 kcal）");
    expect(result.notes.targetCalories).toContain("現在の体重での消費 2494 kcal より、156 kcal 多い量です");
  });

  it("体脂肪率が無いと Mifflin-St Jeor 式で、目標体重での基礎代謝を出す", () => {
    // 10 × 93.5 + 6.25 × 176 − 5 × 39 + 5 = 1845 → × 1.375 = 2537 → 2550
    const result = suggestTargets({ ...full, currentBodyFatPercent: "" }, ["targetCalories"]);
    expect(result.values.targetCalories).toBe("2550");
    expect(result.notes.targetCalories).toContain("基礎代謝 1845 × 1.375 = 2537 kcal");
  });

  it("目標体重での消費が 1200 kcal を下回るときは、1200 kcal に合わせて、そう表示する", () => {
    // 60 歳・女性・150cm・40kg・活動係数 1.2: 基礎代謝 877 × 1.2 = 1052 → 下限の 1200
    const small: FormValues = {
      gender: "female",
      age: "60",
      heightCm: "150",
      currentWeightKg: "40",
      currentBodyFatPercent: "",
      activityLevel: "1.2",
      targetWeightKg: "40",
    };
    const result = suggestTargets(small, ["targetCalories"]);
    expect(result.values.targetCalories).toBe("1200");
    expect(result.notes.targetCalories).toContain("下限を下回るため、1200 kcal に合わせています");
  });

  it("BMI 25 未満なら、目標体重は現在の体重を維持", () => {
    const result = suggestTargets({ ...full, heightCm: "180", currentWeightKg: "70", currentBodyFatPercent: "" }, ["targetWeightKg"]);
    expect(result.values.targetWeightKg).toBe("70");
    expect(result.notes.targetWeightKg).toContain("維持");
  });

  it("材料が足りないときは、値を入れず、理由を返す", () => {
    const nothing = suggestTargets({ age: "39" }, SUGGESTABLE_FIELDS);
    expect(nothing.values).toEqual({});
    expect(Object.keys(nothing.errors).sort()).toEqual(["targetCalories", "targetProteinG", "targetWeightKg"]);
    expect(nothing.errors.targetWeightKg).toContain("現在の体重と身長");
  });

  it("活動係数が未選択なら、カロリーだけが提案できない(体重とタンパク質は提案できる)", () => {
    const result = suggestTargets({ ...full, activityLevel: "" }, SUGGESTABLE_FIELDS);
    expect(result.errors.targetCalories).toContain("活動係数");
    expect(result.values).toEqual({ targetWeightKg: "93.5", targetProteinG: "131" });
  });

  it("基礎代謝に必要な項目が足りないときは、足りない項目名を理由に出す", () => {
    const result = suggestTargets({ ...full, currentBodyFatPercent: "", heightCm: "", gender: "" }, ["targetCalories"]);
    expect(result.errors.targetCalories).toContain("身長・性別");
  });

  it("目標体重が数字として読めない(abc など)ときも、仮定せず、理由を出す", () => {
    const result = suggestTargets({ ...full, targetWeightKg: "abc" }, ["targetProteinG"]);
    expect(result.values).toEqual({});
    expect(result.errors.targetProteinG).toContain("目標体重の値（abc）は使えません");
  });

  it("目標体重が空(空白だけを含む)なら、入力済みではないので、5% 減を仮定して提案する", () => {
    const result = suggestTargets({ ...full, targetWeightKg: "   " }, ["targetProteinG"]);
    expect(result.values.targetProteinG).toBe("131");
    expect(result.notes.targetProteinG).toContain("を仮定");
  });
});

describe("年齢の確認(目標値の提案は 18 歳以上だけ)", () => {
  it("18 歳未満には、どの項目も提案せず、専門家に相談するよう伝える", () => {
    const result = suggestTargets({ ...full, age: "17" }, SUGGESTABLE_FIELDS);
    expect(result.values).toEqual({});
    expect(result.notes).toEqual({});
    expect(Object.keys(result.errors).sort()).toEqual(["targetCalories", "targetProteinG", "targetWeightKg"]);
    expect(result.errors.targetWeightKg).toContain("18 歳以上の方が対象");
    expect(result.errors.targetWeightKg).toContain("医師や専門家");
  });

  it("ちょうど 18 歳なら提案する", () => {
    expect(suggestTargets({ ...full, age: "18" }, ["targetWeightKg"]).values.targetWeightKg).toBe("93.5");
  });

  it("年齢が空(または読めない・範囲外)なら、提案せず、年齢の入力を求める", () => {
    for (const age of ["", "abc", "4", "500"]) {
      const result = suggestTargets({ ...full, age }, ["targetWeightKg", "targetCalories"]);
      expect(result.values, `age=${age}`).toEqual({});
      expect(result.errors.targetWeightKg, `age=${age}`).toContain("年齢（18 歳以上）の入力が必要");
    }
  });

  it("選んだ項目にだけ理由を付ける", () => {
    const result = suggestTargets({ ...full, age: "17" }, ["targetCalories"]);
    expect(Object.keys(result.errors)).toEqual(["targetCalories"]);
  });
});
