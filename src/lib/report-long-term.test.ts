import { describe, expect, it } from "vitest";
import { longTermPeriod } from "./long-term-period";
import { buildDayRecords, type ReportSource } from "./report-input";
import { buildLongTermInput, buildMonthSummaries } from "./report-long-term";
import { buildTrendViews, type TrendInputs } from "./trend-views";

// 9 月の 3 日と、10 月の 4 日(2 つの月にまたがる、小さなデータ)
const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const weights: Record<string, string> = { "2026-09-28": "70.00", "2026-09-30": "69.50", "2026-10-02": "69.00", "2026-10-04": "68.50" };
const inputs: TrendInputs = {
  dates,
  finishedBefore: "2026-10-10",
  rows: dates.map((date) => ({ date, morningWeightKg: weights[date] ?? null, morningBodyFatPercent: null, sleepBedtime: "01:00", sleepWakeTime: "07:00", profileTargetCalories: 2000, profileActivityLevel: date < "2026-10-01" ? "1.200" : "1.375" })),
  intake: dates.map((date) => ({ date, kcal: 1900, mealCount: 3 })),
  exercises: [{ date: "2026-10-02", type: "walk", intensity: "normal", minutes: 30 }],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "68.50", currentBodyFatPercent: null, gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
};
const source: ReportSource = {
  meals: dates.flatMap((date) => [
    { date, time: "08:00", name: "朝", kcal: 500, proteinG: 25, fatG: 15, carbG: 60, fiberG: 3, saltG: 2 },
    { date, time: "12:00", name: "昼", kcal: 700, proteinG: 30, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
    { date, time: "19:00", name: "夕", kcal: 700, proteinG: 35, fatG: 20, carbG: 90, fiberG: 4, saltG: 3 },
  ]),
  exercises: [{ date: "2026-10-02", type: "walk", intensity: "normal", minutes: 30, startTime: null, memo: "メモの文章" }],
  positives: [{ date: "2026-09-29", body: "日記の文章(良かったこと)" }],
  reflections: [{ date: "2026-09-30", text: "日記の文章(気づき)" }],
};
const views = buildTrendViews(inputs);
const records = buildDayRecords(dates, views, source, new Set(dates));
const summaries = buildMonthSummaries({ months: ["2026-09", "2026-10"], dates, views, records, rows: inputs.rows, profileActivityLevel: "1.375" });
const period = longTermPeriod("quarterly", "2026-Q3")!;

describe("buildMonthSummaries", () => {
  it("日ごとの点を、月ごとに切って、1 か月のまとめにする", () => {
    expect(summaries.map((s) => [s.月, s.日数, s.記録のある日数])).toEqual([["2026-09", 3, 3], ["2026-10", 4, 4]]);
    expect(summaries[0].体重).toMatchObject({ 最初の記録: { 日付: "2026-09-28", 値: 70 }, 最後の記録: { 日付: "2026-09-30", 値: 69.5 }, 変化: -0.5 });
    expect(summaries[1].体重).toMatchObject({ 最初の記録: { 日付: "2026-10-02", 値: 69 }, 最後の記録: { 日付: "2026-10-04", 値: 68.5 } });
  });

  it("運動と活動係数は、その月の分だけ(9 月は 1.2、10 月は 1.375)", () => {
    expect(summaries[0].運動).toMatchObject({ 運動した日数: 0, 活動係数: { 値: 1.2 } });
    expect(summaries[1].運動).toMatchObject({ 運動した日数: 1, 活動係数: { 値: 1.375 } });
  });
});

describe("buildLongTermInput", () => {
  const themes = new Map([["2026-09", { worries: ["夜食"], wins: [], topics: [] as string[] }]]);

  it("期間・数えた月・月ごとのまとめ・推移を持つ。月ごとのテーマを、まとめの日記に入れる(無い月は null)", () => {
    const input = buildLongTermInput({ period, end: "2026-09-30", summaries, usableMonths: ["2026-09", "2026-10"], themes });
    expect(input.期間).toEqual({ 種類: "四半期", 題名: "2026 年 7〜9 月(第 3 四半期)", 開始: "2026-07-01", 終了: "2026-09-30", 月数: 2 });
    expect(input.数えた月).toEqual(["2026-09", "2026-10"]);
    expect(input.記録が足りない月).toEqual([]);
    expect(input.月ごとのまとめ[0].日記.テーマ).toEqual({ 悩み: ["夜食"], 達成: [], 話題: [] });
    expect(input.月ごとのまとめ[1].日記.テーマ).toBeNull();
  });

  it("推移: 月ごとの値(無い月は null)と、いちばん高かった月・低かった月", () => {
    const input = buildLongTermInput({ period, end: "2026-10-04", summaries, usableMonths: ["2026-09", "2026-10"], themes });
    expect(input.推移.体重の月末の記録kg).toEqual([{ 月: "2026-09", 値: 69.5 }, { 月: "2026-10", 値: 68.5 }]);
    expect(input.推移.運動した日数).toEqual([{ 月: "2026-09", 値: 0 }, { 月: "2026-10", 値: 1 }]);
    expect((input.推移.高低 as Record<string, unknown>).運動した日数).toEqual({ いちばん高かった月: { 月: "2026-10", 値: 1 }, いちばん低かった月: { 月: "2026-09", 値: 0 } });
    expect(input.体重の期間全体の変化).toEqual({ 最初: { 日付: "2026-09-28", kg: 70 }, 最後: { 日付: "2026-10-04", kg: 68.5 }, 変化kg: -1.5 });
  });

  it("記録が足りない月は、数字を渡さず、名前だけ伝える(推移・体重の変化にも入れない)", () => {
    const input = buildLongTermInput({ period, end: "2026-10-04", summaries, usableMonths: ["2026-10"], themes });
    expect(input.数えた月).toEqual(["2026-10"]);
    expect(input.記録が足りない月).toEqual(["2026-09"]);
    expect(input.月ごとのまとめ.map((s) => s.月)).toEqual(["2026-10"]);
    expect(input.体重の期間全体の変化).toEqual({ 最初: { 日付: "2026-10-02", kg: 69 }, 最後: { 日付: "2026-10-04", kg: 68.5 }, 変化kg: -0.5 });
    expect((input.推移.高低 as Record<string, unknown>).運動した日数).toBeNull(); // 値のある月が 1 つだけなら、高低は出さない
  });

  it("日記の文章(良かったこと・気づき・運動のメモ)は、入力に入らない", () => {
    const text = JSON.stringify(buildLongTermInput({ period, end: "2026-10-04", summaries, usableMonths: ["2026-09", "2026-10"], themes }));
    for (const body of ["日記の文章", "メモの文章"]) expect(text).not.toContain(body);
  });
});
