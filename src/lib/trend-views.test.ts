import { describe, expect, it } from "vitest";
import { buildTrendViews, type TrendInputs } from "./trend-views";

const base: TrendInputs = {
  dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
  finishedBefore: "2026-10-03", // 10-03 は書きかけ
  rows: [
    { date: "2026-10-01", morningWeightKg: "70.00", morningBodyFatPercent: "20.0", sleepBedtime: "23:30", sleepWakeTime: "06:30", profileTargetCalories: 2000, profileActivityLevel: "1.375" },
    { date: "2026-10-02", morningWeightKg: "69.50", morningBodyFatPercent: null, sleepBedtime: null, sleepWakeTime: null, profileTargetCalories: 2000, profileActivityLevel: "1.375" },
  ],
  intake: [
    { date: "2026-10-01", kcal: 1900, mealCount: 3 },
    { date: "2026-10-03", kcal: 500, mealCount: 1 },
  ],
  exercises: [],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: "20.0", gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
};

describe("buildTrendViews", () => {
  it("体重・体脂肪率・睡眠・カロリーの点を、dates の並びで作る", () => {
    const views = buildTrendViews(base);
    expect(views.weight.map((p) => p.value)).toEqual([70, 69.5, null]);
    expect(views.bodyFat.map((p) => p.value)).toEqual([20, null, null]);
    expect(views.sleep.map((p) => p.minutes)).toEqual([420, null, null]);
    expect(views.calories.map((p) => p.intake)).toEqual([1900, null, 500]);
  });

  it("過ぎた日で、食事が 1 回だけ、または摂取が目標の 6 割未満の日は sparse(データ不足)。書きかけの日と、記録が無い日は sparse にしない", () => {
    const views = buildTrendViews({
      ...base,
      finishedBefore: "2026-10-05", // 10-03 も、過ぎた日にする
      dates: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
      intake: [
        { date: "2026-10-01", kcal: 1900, mealCount: 3 }, // ふつう
        { date: "2026-10-03", kcal: 500, mealCount: 1 }, // 1 回だけ
        { date: "2026-10-04", kcal: 1000, mealCount: 3 }, // 目標 2000 の 5 割
      ],
    });
    expect(views.calories.map((p) => p.sparse)).toEqual([false, false, true, true]);
    expect(views.calories.map((p) => p.mealCount)).toEqual([3, 0, 1, 3]);
    // 書きかけの日は、まだ記録が増えるので、sparse にしない
    expect(buildTrendViews(base).calories.map((p) => p.sparse)).toEqual([false, false, false]);
  });

  it("書きかけの日(finishedBefore 以降)だけ inProgress", () => {
    expect(buildTrendViews(base).calories.map((p) => p.inProgress)).toEqual([false, false, true]);
  });

  it("消費の目安と差は、プロフィールの身長・年齢・性別・活動係数から出る(食事の無い日の差は null)", () => {
    const calories = buildTrendViews(base).calories;
    expect(calories[0].burnKcal).not.toBeNull();
    expect(calories[0].diffKcal).toBe(1900 - (calories[0].burnKcal ?? 0));
    expect(calories[1].diffKcal).toBeNull();
  });

  it("JSON に直して戻しても、同じ点ができる(レポートは入力を JSON で保存し、開くたびに作り直す)", () => {
    const restored: TrendInputs = JSON.parse(JSON.stringify(base));
    expect(buildTrendViews(restored)).toEqual(buildTrendViews(base));
  });

  it("期間より前の朝の体重・目標は、取った行の中に無ければ、補いの値を使う", () => {
    const views = buildTrendViews({ ...base, rows: [], weightBeforeFrom: { weight: "80.00", date: "2026-09-20" }, targetBeforeFrom: 1800 });
    // 日の行が無い、過ぎた日は、それ以前の固定した目標を引き継ぐ
    expect(views.calories[0].target).toBe(1800);
  });
});
