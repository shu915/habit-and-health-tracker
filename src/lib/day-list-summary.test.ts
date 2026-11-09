import { describe, expect, it } from "vitest";
import { buildDayListSummary, datesBetween } from "./day-list-summary";
import type { TrendRaw } from "./trend-views";

const raw: TrendRaw = {
  rows: [
    { date: "2026-11-01", morningWeightKg: "70.00", morningBodyFatPercent: null, sleepBedtime: null, sleepWakeTime: null, profileTargetCalories: 2000, profileActivityLevel: "1.375" },
    { date: "2026-11-02", morningWeightKg: null, morningBodyFatPercent: null, sleepBedtime: null, sleepWakeTime: null, profileTargetCalories: 2000, profileActivityLevel: "1.375" },
    { date: "2026-11-04", morningWeightKg: null, morningBodyFatPercent: null, sleepBedtime: null, sleepWakeTime: null, profileTargetCalories: 2000, profileActivityLevel: "1.375" },
  ],
  intake: [
    { date: "2026-11-01", kcal: 1900, mealCount: 3 }, // ふつう
    { date: "2026-11-02", kcal: 500, mealCount: 1 }, // 1 回だけ
    { date: "2026-11-04", kcal: 1000, mealCount: 3 }, // 目標の 5 割
  ],
  exercises: [
    { date: "2026-11-01", type: "walk", intensity: "normal", minutes: 20 },
    { date: "2026-11-01", type: "walk", intensity: "normal", minutes: 15 },
  ],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: null, gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: null },
};

describe("datesBetween", () => {
  it("最初の日から最後の日まで、連続した日付(古い順)。月をまたいでも", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-11-01", "2026-11-01")).toEqual(["2026-11-01"]);
  });
});

describe("buildDayListSummary(一覧に出す、日ごとの食事と運動の要約)", () => {
  const summary = buildDayListSummary(datesBetween("2026-11-01", "2026-11-04"), raw, "2026-11-05");

  it("摂取・食事の回数・運動の合計(分)を、日ごとに持つ。食事の無い日は、摂取が null", () => {
    expect(summary.get("2026-11-01")).toMatchObject({ intakeKcal: 1900, mealCount: 3, exerciseMinutes: 35 });
    expect(summary.get("2026-11-03")).toMatchObject({ intakeKcal: null, mealCount: 0, exerciseMinutes: 0 });
  });

  it("データ不足(食事が 1 回だけ、または摂取が目標の 6 割未満)は sparse。推移のグラフと、同じ判定", () => {
    expect([1, 2, 3, 4].map((d) => summary.get(`2026-11-0${d}`)?.sparse)).toEqual([false, true, false, true]);
  });

  it("書きかけの日(finishedBefore 以降)は、sparse にしない(まだ記録が増える)", () => {
    const today = buildDayListSummary(datesBetween("2026-11-01", "2026-11-04"), raw, "2026-11-04"); // 11-04 は書きかけ
    expect(today.get("2026-11-04")?.sparse).toBe(false);
    expect(today.get("2026-11-02")?.sparse).toBe(true);
  });
});
