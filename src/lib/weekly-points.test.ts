import { describe, expect, it } from "vitest";
import { longTermWeekly, weeklyDayCounts, weeklyFromDaily } from "./weekly-points";
import type { TrendInputs } from "./trend-views";

// 2026-10-05(月)〜 2026-10-18(日)の 2 週間
const range = { first: "2026-10-05", last: "2026-10-18" };
const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

describe("weeklyFromDaily", () => {
  it("月曜始まりの週ごとに、中央値と、最小・最大(ばらつき)を出す", () => {
    const daily = [
      { date: day(5), value: 70 },
      { date: day(7), value: 72 },
      { date: day(9), value: 71 }, // 1 週目: 70, 71, 72
      { date: day(12), value: 68 },
      { date: day(18), value: 69 }, // 2 週目: 68, 69(日曜日は、その週に入る)
    ];
    const weeks = weeklyFromDaily(daily, range, { minRecorded: 2, digits: 2 });
    expect(weeks).toEqual([
      { weekStart: "2026-10-05", label: "10/5", recorded: 3, median: 71, low: 70, high: 72 },
      { weekStart: "2026-10-12", label: "10/12", recorded: 2, median: 68.5, low: 68, high: 69 },
    ]);
  });

  it("記録が少ない週は、点を出さない(null。0 にしない)。記録の無い週も、週は残す", () => {
    const weeks = weeklyFromDaily([{ date: day(6), value: 70 }], range, { minRecorded: 2 });
    expect(weeks.map((w) => [w.weekStart, w.recorded, w.median])).toEqual([["2026-10-05", 1, null], ["2026-10-12", 0, null]]);
  });

  it("値の無い日(null)と、期間の外の日は、数えない。月の途中から始まる期間でも、最初の週は、その月曜日から", () => {
    const weeks = weeklyFromDaily([{ date: "2026-10-07", value: 70 }, { date: "2026-10-08", value: null }, { date: "2026-10-30", value: 99 }], { first: "2026-10-07", last: "2026-10-18" }, { minRecorded: 1 });
    expect(weeks.map((w) => [w.weekStart, w.recorded])).toEqual([["2026-10-05", 1], ["2026-10-12", 0]]);
  });

  it("桁数に丸める(睡眠は整数の分)", () => {
    const weeks = weeklyFromDaily([{ date: day(5), value: 371.4 }, { date: day(6), value: 372.2 }, { date: day(7), value: 380.9 }], range, { minRecorded: 3, digits: 0 });
    expect(weeks[0]).toMatchObject({ median: 372, low: 371, high: 381 });
  });
});

describe("weeklyDayCounts", () => {
  it("週ごとの、運動した日数。同じ日の複数の運動は、1 日と数える。運動の無い週は 0", () => {
    const weeks = weeklyDayCounts([day(5), day(5), day(7), day(9)], range);
    expect(weeks.map((w) => [w.weekStart, w.days])).toEqual([["2026-10-05", 3], ["2026-10-12", 0]]);
  });
});

describe("longTermWeekly(保存した日ごとの数字から、週ごとの系列を作る)", () => {
  const dates = Array.from({ length: 14 }, (_, i) => day(5 + i));
  const inputs: TrendInputs = {
    dates,
    finishedBefore: "2026-10-30",
    rows: dates.map((date, i) => ({ date, morningWeightKg: i % 2 === 0 ? "70.00" : null, morningBodyFatPercent: null, sleepBedtime: "01:00", sleepWakeTime: "07:00", profileTargetCalories: 2000, profileActivityLevel: "1.375" })),
    intake: dates.map((date) => ({ date, kcal: 1900, mealCount: 3 })),
    exercises: [{ date: day(6), type: "walk", intensity: "normal", minutes: 30 }],
    weightBeforeFrom: null,
    bodyFatBeforeFrom: null,
    targetBeforeFrom: null,
    profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: null, gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
  };

  it("週の数は、2 週間なら 2。睡眠・体重・摂取・目標・運動の系列が、同じ週の並びで出る", () => {
    const weekly = longTermWeekly(inputs);
    for (const series of [weekly.sleepMinutes, weekly.weightKg, weekly.bodyFatPercent, weekly.intakeKcal, weekly.targetKcal, weekly.exerciseDays]) expect(series).toHaveLength(2);
    expect(weekly.sleepMinutes[0]).toMatchObject({ median: 360, recorded: 7 });
    expect(weekly.weightKg[0]).toMatchObject({ median: 70, recorded: 4 }); // 1 日おき(月・水・金・日)
    expect(weekly.bodyFatPercent[0].median).toBeNull(); // 体脂肪率は、記録が無い
    expect(weekly.intakeKcal[0].median).toBe(1900);
    expect(weekly.targetKcal[0].median).toBeGreaterThan(0);
    expect(weekly.exerciseDays.map((w) => w.days)).toEqual([1, 0]);
  });

  it("書きかけの日と、データ不足の日は、摂取に入れない(finishedBefore より後の日)", () => {
    const weekly = longTermWeekly({ ...inputs, finishedBefore: day(12) }); // 12 日から先は、書きかけ
    expect(weekly.intakeKcal[1].recorded).toBe(0); // 2 週目(12〜18)は、全部、書きかけ
  });
});
