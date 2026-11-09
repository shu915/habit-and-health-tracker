import { describe, expect, it } from "vitest";
import { CHART_MAX_PERCENT, judgement, mealRadar, type RadarAxis, type RadarMeal } from "./meal-radar";

const meal = (over: Partial<RadarMeal> = {}): RadarMeal => ({
  kcal: 600,
  proteinG: "30.0",
  fatG: "20.0",
  netCarbG: "70.0",
  fiberG: "5.0",
  saltG: "2.0",
  ...over,
});
const base = { targetKcal: 2000, exerciseKcal: 0 };
const axisOf = (result: ReturnType<typeof mealRadar>, key: string) => {
  const axis = result.axes.find((a) => a.key === key);
  if (!axis) throw new Error(`no axis ${key}`);
  return axis;
};

describe("mealRadar", () => {
  it("軸は 6 つ(カロリー・たんぱく質・脂質・糖質・食物繊維・塩分)で、食事の合計を出す", () => {
    const result = mealRadar({ ...base, meals: [meal(), meal({ kcal: 400, proteinG: "20.0" })] });
    expect(result.axes.map((a) => a.key)).toEqual(["kcal", "protein", "fat", "carb", "fiber", "salt"]);
    expect(axisOf(result, "kcal").actual).toBe(1000);
    expect(axisOf(result, "protein").actual).toBe(50);
    expect(axisOf(result, "salt").actual).toBe(4);
    expect(axisOf(result, "fiber").actual).toBe(10);
  });

  it("目標(ゾーンの真ん中): たんぱく質は 16.5%÷4、脂質は 25%÷9、糖質は 57.5%÷4、食物繊維は一律 20g(帯 16〜24g)、塩分は一律 10g(帯 8〜12g。日本人の実際の摂取量。理想ではない)", () => {
    const result = mealRadar({ ...base, meals: [meal()] });
    expect(axisOf(result, "kcal").reference).toBe(2000);
    expect(axisOf(result, "protein").reference).toBe(82.5); // 2000 × 0.165 ÷ 4
    expect(axisOf(result, "fat").reference).toBe(55.6); // 2000 × 0.25 ÷ 9
    expect(axisOf(result, "carb").reference).toBe(287.5); // 2000 × 0.575 ÷ 4
    expect(axisOf(result, "salt").reference).toBe(10);
    expect(axisOf(result, "fiber").reference).toBe(20);
  });

  it("ゾーンの幅(真ん中を 100% とした %): たんぱく質 13〜20%・脂質 20〜30%・糖質 46〜69% のエネルギー比、カロリーは ±10%、食物繊維は 16〜24g、塩分は 8〜12g", () => {
    const result = mealRadar({ ...base, meals: [meal()] });
    const zone = (key: string) => [axisOf(result, key).zoneLow, axisOf(result, key).zoneHigh];
    expect(zone("protein")).toEqual([79, 121]); // 13 ÷ 16.5, 20 ÷ 16.5
    expect(zone("fat")).toEqual([80, 120]);
    expect(zone("carb")).toEqual([80, 120]);
    expect(zone("kcal")).toEqual([90, 110]);
    expect(zone("fiber")).toEqual([80, 120]); // 16〜24g(20g が 100%)
    expect(zone("salt")).toEqual([80, 120]); // 8〜12g(10g が 100%)
  });

  it("運動した日は、カロリーの目標に運動の消費を足す。脂質・糖質の目標も、その値から出す", () => {
    const result = mealRadar({ ...base, exerciseKcal: 400, meals: [meal()] });
    expect(result.baseKcal).toBe(2000);
    expect(result.exerciseKcal).toBe(400);
    expect(result.allowanceKcal).toBe(2400);
    expect(axisOf(result, "kcal").reference).toBe(2400);
    expect(axisOf(result, "kcal").percent).toBe(25); // 600 ÷ 2400
    expect(axisOf(result, "fat").reference).toBe(66.7); // 2400 × 0.25 ÷ 9
    expect(axisOf(result, "carb").reference).toBe(345); // 2400 × 0.575 ÷ 4
    expect(axisOf(result, "protein").reference).toBe(82.5); // たんぱく質は運動で変えない
    expect(axisOf(result, "salt").reference).toBe(10);
  });

  it("割合は実際の値÷目標。描画用は 200% で頭打ち(割合そのものは頭打ちにしない)", () => {
    const result = mealRadar({ ...base, meals: [meal({ saltG: "25.0" })] }); // 塩分の基準は 10g。その 2.5 倍
    const salt = axisOf(result, "salt");
    expect(salt.percent).toBe(250); // 25 ÷ 10
    expect(salt.chartPercent).toBe(CHART_MAX_PERCENT);
    expect(axisOf(result, "kcal").percent).toBe(30); // 600 ÷ 2000
  });

  it("ゾーンの上端は、グラフの端より内側にある(超えた分を描く余白が残る)", () => {
    const result = mealRadar({ ...base, meals: [meal()] });
    for (const axis of result.axes) if (axis.zoneHigh !== null) expect(axis.zoneHigh, axis.key).toBeLessThan(CHART_MAX_PERCENT);
  });

  it("目標カロリーが未設定なら、カロリー・たんぱく質・脂質・糖質は割合なし(描画は 0)。食物繊維と塩分は出る", () => {
    const result = mealRadar({ ...base, targetKcal: null, exerciseKcal: 400, meals: [meal()] });
    expect(result.allowanceKcal).toBeNull(); // 目標が無ければ、運動だけを目標にはしない
    for (const key of ["kcal", "protein", "fat", "carb"]) {
      expect(axisOf(result, key).percent, key).toBeNull();
      expect(axisOf(result, key).chartPercent, key).toBe(0);
    }
    expect(axisOf(result, "fiber").percent).toBe(25); // 5 ÷ 20
    expect(axisOf(result, "salt").percent).not.toBeNull();
  });

  it("食物繊維と塩分が分からない食事があれば、印を立てる(合計は分かる分だけ)", () => {
    const result = mealRadar({ ...base, meals: [meal(), meal({ fiberG: null, saltG: null })] });
    expect(result.incompleteFiber).toBe(true);
    expect(result.incompleteSalt).toBe(true);
    expect(axisOf(result, "fiber").actual).toBe(5);
    expect(axisOf(result, "salt").actual).toBe(2);
    expect(mealRadar({ ...base, meals: [meal()] }).incompleteFiber).toBe(false);
  });

  it("食事が無ければ、すべて 0", () => {
    const result = mealRadar({ ...base, meals: [] });
    expect(result.axes.every((a) => a.actual === 0)).toBe(true);
    expect(axisOf(result, "fiber").actual).toBe(0);
  });
});

describe("judgement", () => {
  const axis = (direction: RadarAxis["direction"], percent: number | null, zone: Pick<RadarAxis, "zoneLow" | "zoneHigh"> = { zoneLow: 90, zoneHigh: 110 }): RadarAxis => ({
    ...zone,
    key: "kcal",
    label: "",
    unit: "",
    actual: 0,
    reference: 1,
    percent,
    chartPercent: 0,
    direction,
  });
  it("目標が無ければ言わない", () => expect(judgement(axis("near", null))).toBeNull());
  it("near: 軸ごとのゾーンで決まる(脂質 80〜120%)", () => {
    const fat = { zoneLow: 80, zoneHigh: 120 };
    expect(judgement(axis("near", 80, fat))).toBe("目標に近い");
    expect(judgement(axis("near", 120, fat))).toBe("目標に近い");
    expect(judgement(axis("near", 79, fat))).toBe("少なめ");
    expect(judgement(axis("near", 121, fat))).toBe("多め");
  });
  it("limit(塩分、ゾーン 80〜120%): 上端までは範囲内、30 ポイントまでは「やや多め」、それを超えると「多め」", () => {
    const salt = { zoneLow: 80, zoneHigh: 120 };
    expect(judgement(axis("limit", 120, salt))).toBe("目標の範囲内");
    expect(judgement(axis("limit", 121, salt))).toBe("やや多め");
    expect(judgement(axis("limit", 150, salt))).toBe("やや多め");
    expect(judgement(axis("limit", 151, salt))).toBe("多め");
  });
  it("reach(たんぱく質、ゾーン 79〜121%): 下端に届けば届いている。上を超えても「多め」とは言わない", () => {
    const protein = { zoneLow: 79, zoneHigh: 121 };
    expect(judgement(axis("reach", 79, protein))).toBe("届いています");
    expect(judgement(axis("reach", 150, protein))).toBe("届いています");
    expect(judgement(axis("reach", 59, protein))).toBe("あと少し");
    expect(judgement(axis("reach", 58, protein))).toBe("少なめ");
  });
  it("reach(食物繊維、16〜24g = 80〜120%): 80% 以上で届いている(上を超えても「多め」とは言わない)、60% 以上であと少し", () => {
    const fiber = { zoneLow: 80, zoneHigh: 120 };
    expect(judgement({ ...axis("reach", 120, fiber), key: "fiber" })).toBe("届いています");
    expect(judgement({ ...axis("reach", 150, fiber), key: "fiber" })).toBe("届いています");
    expect(judgement(axis("reach", 100, fiber))).toBe("届いています");
    expect(judgement(axis("reach", 80, fiber))).toBe("届いています");
    expect(judgement(axis("reach", 79, fiber))).toBe("あと少し");
    expect(judgement(axis("reach", 60, fiber))).toBe("あと少し");
    expect(judgement(axis("reach", 59, fiber))).toBe("少なめ");
  });
  it("near: 既定のゾーン(90〜110%)の判定", () => {
    expect(judgement(axis("near", 89))).toBe("少なめ");
    expect(judgement(axis("near", 90))).toBe("目標に近い");
    expect(judgement(axis("near", 110))).toBe("目標に近い");
    expect(judgement(axis("near", 111))).toBe("多め");
  });
});
