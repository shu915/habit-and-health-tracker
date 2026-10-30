import { describe, expect, it } from "vitest";
import { energyOverview, type ProfileEnergyInput } from "./energy-overview";

// DB の行の形(numeric は文字列、integer は数値)。ユーザー本人に近い例
const profile: ProfileEnergyInput = {
  gender: "male",
  age: 39,
  heightCm: "176.0",
  currentWeightKg: "98.30",
  currentBodyFatPercent: "32.0",
  activityLevel: "1.375",
  targetCalories: 2120,
};

describe("energyOverview", () => {
  it("消費カロリーの目安と、目標カロリーとの差を出す", () => {
    expect(energyOverview(profile)).toEqual({
      kind: "ready",
      tdeeKcal: 2494,
      bmrKcal: 1814,
      method: "katch-mcardle",
      activityLevel: 1.375,
      activityName: "軽い",
      targetCalories: 2120,
      targetDiffKcal: -374, // 消費より 374 kcal 少なく食べる目標
    });
  });

  it("目標カロリーが未設定なら、差は null", () => {
    expect(energyOverview({ ...profile, targetCalories: null })).toMatchObject({
      kind: "ready",
      targetCalories: null,
      targetDiffKcal: null,
    });
  });

  it("目標カロリーが消費より多いときは、差がプラスになる", () => {
    expect(energyOverview({ ...profile, targetCalories: 2600 })).toMatchObject({ targetDiffKcal: 106 });
  });

  it("体脂肪率が無ければ Mifflin-St Jeor 式で計算する", () => {
    expect(energyOverview({ ...profile, currentBodyFatPercent: null })).toMatchObject({
      kind: "ready",
      method: "mifflin-st-jeor",
      bmrKcal: 1893,
      tdeeKcal: 2603,
    });
  });

  it("活動係数が未選択なら、基礎代謝だけを返す", () => {
    expect(energyOverview({ ...profile, activityLevel: null })).toEqual({
      kind: "needs-activity",
      bmrKcal: 1814,
      method: "katch-mcardle",
    });
  });

  it("選択肢にない活動係数は、計算に使わない(未選択と同じ扱い。AI の提案は選択肢に丸めて保存する決まり)", () => {
    expect(energyOverview({ ...profile, activityLevel: "1.450" })).toMatchObject({
      kind: "needs-activity",
    });
  });

  it("基礎代謝に必要な項目が足りなければ、足りない項目を返す", () => {
    expect(
      energyOverview({ ...profile, currentBodyFatPercent: null, age: null, gender: null }),
    ).toEqual({ kind: "missing", missing: ["年齢", "性別"] });
    expect(
      energyOverview({
        gender: null,
        age: null,
        heightCm: null,
        currentWeightKg: null,
        currentBodyFatPercent: null,
        activityLevel: null,
        targetCalories: null,
      }),
    ).toEqual({ kind: "missing", missing: ["体重"] });
  });
});
