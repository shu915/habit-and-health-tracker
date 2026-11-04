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

  it("目標: たんぱく質は 20%÷4、脂質は 25%÷9、糖質は 50%÷4、食物繊維は一律 20g、塩分は一律 7.5g", () => {
    const result = mealRadar({ ...base, meals: [meal()] });
    expect(axisOf(result, "kcal").reference).toBe(2000);
    expect(axisOf(result, "protein").reference).toBe(100); // 2000 × 0.2 ÷ 4
    expect(axisOf(result, "fat").reference).toBe(55.6); // 2000 × 0.25 ÷ 9
    expect(axisOf(result, "carb").reference).toBe(250); // 2000 × 0.5 ÷ 4
    expect(axisOf(result, "salt").reference).toBe(7.5);
    expect(axisOf(result, "fiber").reference).toBe(20);
  });

  it("運動した日は、カロリーの目標に運動の消費を足す。脂質・糖質の目標も、その値から出す", () => {
    const result = mealRadar({ ...base, exerciseKcal: 400, meals: [meal()] });
    expect(result.baseKcal).toBe(2000);
    expect(result.exerciseKcal).toBe(400);
    expect(result.allowanceKcal).toBe(2400);
    expect(axisOf(result, "kcal").reference).toBe(2400);
    expect(axisOf(result, "kcal").percent).toBe(25); // 600 ÷ 2400
    expect(axisOf(result, "fat").reference).toBe(66.7); // 2400 × 0.25 ÷ 9
    expect(axisOf(result, "carb").reference).toBe(300); // 2400 × 0.5 ÷ 4
    expect(axisOf(result, "protein").reference).toBe(100); // たんぱく質は運動で変えない
    expect(axisOf(result, "salt").reference).toBe(7.5);
  });

  it("割合は実際の値÷目標。描画用は 150% で頭打ち(割合そのものは頭打ちにしない)", () => {
    const result = mealRadar({ ...base, meals: [meal({ saltG: "15.0" })] });
    const salt = axisOf(result, "salt");
    expect(salt.percent).toBe(200);
    expect(salt.chartPercent).toBe(CHART_MAX_PERCENT);
    expect(axisOf(result, "kcal").percent).toBe(30); // 600 ÷ 2000
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
  const axis = (direction: RadarAxis["direction"], percent: number | null): RadarAxis => ({
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
  it("limit(塩分): 100% 以下は範囲内、130% までは「やや多め」、それを超えると「多め」", () => {
    expect(judgement(axis("limit", 100))).toBe("目標の範囲内");
    expect(judgement(axis("limit", 101))).toBe("やや多め");
    expect(judgement(axis("limit", 130))).toBe("やや多め");
    expect(judgement(axis("limit", 131))).toBe("多め");
  });
  it("reach: 100% 以上で届いている、80% 以上であと少し", () => {
    expect(judgement(axis("reach", 100))).toBe("届いています");
    expect(judgement(axis("reach", 80))).toBe("あと少し");
    expect(judgement(axis("reach", 79))).toBe("少なめ");
  });
  it("near: 90〜110% は目標に近い", () => {
    expect(judgement(axis("near", 89))).toBe("少なめ");
    expect(judgement(axis("near", 90))).toBe("目標に近い");
    expect(judgement(axis("near", 110))).toBe("目標に近い");
    expect(judgement(axis("near", 111))).toBe("多め");
  });
});
