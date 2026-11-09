import { describe, expect, it } from "vitest";
import { buildDayRecords, buildReportInput, type ReportSource } from "./report-input";
import { buildMonthSummary } from "./report-month";
import { buildTrendViews, type TrendInputs } from "./trend-views";

// 7 日ぶんの小さなデータを、1 か月に見立てて確かめる(月の名前は、ただの文字列)
const dates = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
const makeInputs = (intake: TrendInputs["intake"]): TrendInputs => ({
  dates,
  finishedBefore: "2026-11-05",
  rows: dates.map((date, i) => ({
    date,
    morningWeightKg: i === 0 ? "70.00" : i === 6 ? "69.00" : null,
    morningBodyFatPercent: null,
    sleepBedtime: i < 5 ? "01:00" : null,
    sleepWakeTime: i < 5 ? "07:00" : null,
    profileTargetCalories: 2000,
    profileActivityLevel: "1.375",
  })),
  intake,
  exercises: [{ date: "2026-10-31", type: "walk", intensity: "normal", minutes: 30 }],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: null, gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
});
const source: ReportSource = {
  meals: [
    { date: "2026-10-29", time: "08:00", name: "朝食", kcal: 500, proteinG: 25, fatG: 15, carbG: 60, fiberG: 3, saltG: 2 },
    { date: "2026-10-29", time: "12:00", name: "昼食", kcal: 700, proteinG: 30, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
    { date: "2026-10-29", time: "19:00", name: "夕食", kcal: 700, proteinG: 35, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
    { date: "2026-10-30", time: "08:00", name: "朝食", kcal: 500, proteinG: 25, fatG: 15, carbG: 60, fiberG: 3, saltG: 2 },
    { date: "2026-10-30", time: "12:00", name: "昼食", kcal: 700, proteinG: 30, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
    { date: "2026-10-30", time: "19:00", name: "夕食", kcal: 700, proteinG: 35, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
    { date: "2026-10-30", time: "24:30", name: "夜食", kcal: 300, proteinG: 5, fatG: 10, carbG: 40, fiberG: 1, saltG: 1 },
  ],
  exercises: [{ date: "2026-10-31", type: "walk", intensity: "normal", minutes: 30, startTime: "07:00", memo: "朝の散歩" }],
  positives: [
    { date: "2026-10-31", body: "朝の空気が気持ちよかった。" },
    { date: "2026-10-31", body: "ジムに行けた。" },
  ],
  reflections: [{ date: "2026-10-30", text: "夜遅くに食べてしまった。" }],
};
const recorded = new Set(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-04"]);

// 食事のある日が 2 日だけ(データがそろった日が足りない)と、4 日(足りる)
const fewIntake: TrendInputs["intake"] = [
  { date: "2026-10-29", kcal: 1900, mealCount: 3 },
  { date: "2026-10-30", kcal: 2200, mealCount: 4 },
];
const manyIntake: TrendInputs["intake"] = [
  { date: "2026-10-29", kcal: 1900, mealCount: 3 },
  { date: "2026-10-30", kcal: 2200, mealCount: 4 },
  { date: "2026-10-31", kcal: 2000, mealCount: 3 },
  { date: "2026-11-04", kcal: 1800, mealCount: 3 },
];

function summarize(intake: TrendInputs["intake"]) {
  const views = buildTrendViews(makeInputs(intake));
  const records = buildDayRecords(dates, views, source, recorded);
  const summary = buildMonthSummary({
    month: "2026-10",
    dates,
    sleep: views.sleep,
    weight: views.weight,
    bodyFat: views.bodyFat,
    calories: views.calories,
    records,
    activityLevel: "1.375",
  });
  return { views, records, summary };
}

describe("buildMonthSummary", () => {
  it("記録のある日数と、睡眠・体重のまとめ(最初と最後の記録、変化、中央値)", () => {
    const { summary } = summarize(manyIntake);
    expect(summary).toMatchObject({ 月: "2026-10", 日数: 7, 記録のある日数: 4 });
    expect(summary.睡眠).toMatchObject({ 記録した日数: 5, 睡眠時間の中央値分: 360, 就寝の中央値: "01:00", 起床の中央値: "07:00" });
    expect(summary.体重).toMatchObject({ 記録した日数: 2, 最初の記録: { 日付: "2026-10-29", 値: 70 }, 最後の記録: { 日付: "2026-11-04", 値: 69 }, 変化: -1, 中央値: 69.5 });
    expect(summary.体脂肪率).toEqual({ 記録した日数: 0, 最初の記録: null, 最後の記録: null, 変化: null, 中央値: null }); // 記録が無ければ null(0 ではない)
  });

  it("食事: 24 時以降に食べた日数、データがそろった日が足りなければ、摂取の中央値を出さない", () => {
    const { summary } = summarize(fewIntake);
    expect(summary.食事).toMatchObject({ "食事の記録がある日数": 2, "24時以降に食べた日数": 1, 摂取kcalの中央値: null });
  });

  it("食事: データがそろった日が足りれば、摂取の中央値を出す", () => {
    const { summary } = summarize(manyIntake);
    expect((summary.食事 as Record<string, unknown>).摂取kcalの中央値).toBe(1950);
  });

  it("日記は、件数だけ(文章は入れない)。テーマは、まだ取っていないので null", () => {
    const { summary } = summarize(manyIntake);
    expect(summary.日記).toEqual({ 良かったことの件数: 2, 良かったことを書いた日数: 1, 今日の気づきを書いた日数: 1, テーマ: null });
    expect(JSON.stringify(summary)).not.toContain("朝の空気"); // 日記の文章を、まとめに複製しない
    expect(JSON.stringify(summary)).not.toContain("夜遅くに食べてしまった");
  });

  it("運動と栄養は、運動の要約・栄養の判定(共通の部品)の結果を入れる", () => {
    const { summary } = summarize(manyIntake);
    expect(summary.運動).toMatchObject({ 運動した日数: 1, 運動の回数: 1, 活動係数: { 値: 1.375 } });
    expect(summary.栄養).not.toBeNull();
  });
});

describe("月次レポートの集計との食い違い(同じ月で、同じ数字になる)", () => {
  it("睡眠・体重・摂取・運動・栄養の数字が、一致する", () => {
    const { views, records, summary } = summarize(manyIntake);
    const input = buildReportInput({
      period: { kind: "four-weeks", start: "2026-10-29", end: "2026-11-04", days: 7 },
      dates,
      views,
      source,
      recordedDates: recorded,
      badges: [],
      activityLevel: "1.375",
    });
    const monthly = input.集計;
    expect((summary.睡眠 as Record<string, unknown>).睡眠時間の中央値分).toBe(monthly.睡眠時間の中央値分);
    expect(summary.体重).toMatchObject({ 最初の記録: { 日付: (monthly.体重 as { 最初: { 日付: string } }).最初.日付 }, 最後の記録: { 日付: (monthly.体重 as { 最後: { 日付: string } }).最後.日付 } });
    expect((summary.食事 as Record<string, unknown>).摂取kcalの中央値).toBe(monthly.摂取kcalの中央値);
    expect((summary.食事 as Record<string, unknown>).差の合計).toBe(monthly.摂取マイナス消費の合計);
    expect(summary.運動).toEqual(monthly.運動);
    expect(summary.栄養).toEqual(monthly.栄養);
  });
});

describe("入力の確認", () => {
  it("日ごとの点の数が dates と違うときは、別の日の値を読まないよう、失敗にする", () => {
    const { views, records } = summarize(manyIntake);
    expect(() =>
      buildMonthSummary({ month: "2026-10", dates, sleep: views.sleep, weight: views.weight, bodyFat: views.bodyFat, calories: views.calories.slice(1), records, activityLevel: null }),
    ).toThrow("日ごとの点の数");
  });
});

describe("kcal の中央値は、整数に丸める", () => {
  it("偶数個の日の中央値(2 つの値の平均)が小数になっても、整数で出す(2538.5 → 2539)", () => {
    const even: Parameters<typeof summarize>[0] = [
      { date: "2026-10-29", kcal: 2500, mealCount: 3 },
      { date: "2026-10-30", kcal: 2577, mealCount: 3 },
      { date: "2026-10-31", kcal: 2400, mealCount: 3 },
      { date: "2026-11-04", kcal: 2600, mealCount: 3 },
    ];
    const food = summarize(even).summary.食事;
    expect(food.摂取kcalの中央値).toBe(2539); // 2500 と 2577 の平均 2538.5 → 2539
    expect(Number.isInteger(food.差の中央値)).toBe(true);
  });
});
