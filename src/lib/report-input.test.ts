import { describe, expect, it } from "vitest";
import { buildAnalysis, buildDayRecords, buildFeatures, buildReportInput, type ReportSource } from "./report-input";
import { buildTrendViews, type TrendInputs } from "./trend-views";

const period = { kind: "four-weeks" as const, start: "2026-10-29", end: "2026-11-04", days: 7 }; // 7 日ぶんの小さなデータで確かめる
const dates = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
const inputs: TrendInputs = {
  dates,
  finishedBefore: "2026-11-05",
  rows: dates.map((date, i) => ({ date, morningWeightKg: i === 0 || i === 6 ? (i === 0 ? "70.00" : "69.00") : null, morningBodyFatPercent: null, sleepBedtime: i < 5 ? "01:00" : null, sleepWakeTime: i < 5 ? "07:00" : null, profileTargetCalories: 2000, profileActivityLevel: "1.375" })),
  intake: [
    { date: "2026-10-29", kcal: 1900, mealCount: 3 },
    { date: "2026-10-30", kcal: 3000, mealCount: 3 },
  ],
  exercises: [],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: null, gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
};
const views = buildTrendViews(inputs);
const source: ReportSource = {
  meals: [
    { date: "2026-10-29", time: "12:00", name: "唐揚げ弁当", kcal: 800, proteinG: 30, fatG: 25, carbG: 100, fiberG: 2, saltG: 3 },
    { date: "2026-10-29", time: "19:00", name: "うどん", kcal: 1100, proteinG: 20, fatG: 10, carbG: 150, fiberG: null, saltG: null },
    { date: "2026-10-30", time: "13:00", name: "カレー", kcal: 1000, proteinG: 20, fatG: 30, carbG: 140, fiberG: 3, saltG: 3 },
    { date: "2026-10-30", time: "24:30", name: "ラーメン", kcal: 2000, proteinG: 30, fatG: 60, carbG: 200, fiberG: 2, saltG: 6 },
  ],
  exercises: [{ date: "2026-10-31", type: "walk", intensity: "normal", minutes: 30, startTime: "07:00", memo: "朝の散歩" }],
  positives: [{ date: "2026-10-31", body: "朝の空気が気持ちよかった。" }],
  reflections: [{ date: "2026-10-30", text: "夜遅くに食べてしまった。" }],
};
const recorded = new Set(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-04"]);

describe("buildDayRecords", () => {
  it("記録のある日だけを、日付順に。食事・運動・良かったこと・今日の気づきを、その日に結びつける", () => {
    const records = buildDayRecords(dates, views, source, recorded);
    expect(records.map((r) => r.日付)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-04"]);
    expect(records[1].食事.map((m) => m.名前)).toEqual(["カレー", "ラーメン"]);
    expect(records[1].今日の気づき).toBe("夜遅くに食べてしまった。");
    expect(records[2].運動[0]).toMatchObject({ 種類: "walk", 開始時刻: "07:00", メモ: "朝の散歩" });
    expect(records[2].良かったこと).toEqual(["朝の空気が気持ちよかった。"]);
    expect(records[0].睡眠).toEqual({ 就寝: "01:00", 起床: "07:00", 時間分: 360 });
    expect(records[0].体重kg).toBe(70);
    expect(records[3].体重kg).toBe(69);
  });
  it("食事の無い日の摂取は null(0 ではない)", () => {
    const records = buildDayRecords(dates, views, source, recorded);
    expect(records[2].摂取kcal).toBeNull();
    expect(records[2].摂取マイナス消費).toBeNull();
  });
});

describe("buildFeatures", () => {
  const records = buildDayRecords(dates, views, source, recorded);
  const features = buildFeatures(records);
  it("24 時以降・21 時以降の kcal、食事の間隔、曜日を計算する", () => {
    const f = features[1]; // 10-30(金)
    expect(f.afterMidnightKcal).toBe(2000);
    expect(f.eveningKcal).toBe(2000);
    expect(f.gap).toBe(24 * 60 + 30 - 13 * 60); // 13:00 → 24:30
    expect(f.dow).toBe(4); // 2026-10-30 は金曜
    expect(features[0].gap).toBe(7 * 60);
    expect(features[0].afterMidnightKcal).toBe(0);
  });
  it("同じ夜の就寝と翌日の睡眠は、翌日の記録から取る(翌日が記録のない日なら null)", () => {
    expect(features[0].nextSleep).toBe(360); // 10-29 の翌日 10-30 の睡眠
    expect(features[2].nextSleep).toBeNull(); // 10-31 の翌日 11-01 は記録のない日
  });
});

describe("buildAnalysis(分析材料)", () => {
  const feature = (overrides: Partial<Parameters<typeof buildAnalysis>[0][number]>) => ({ date: "2026-10-01", dow: 0, intake: 2000, diff: 0, bed: 500, first: 720, afterMidnightKcal: 0, eveningKcal: 0, gap: 300, nextBed: 500, nextSleep: 400, nextWeightChange: 0, exercised: false, ...overrides });

  it("日数が少ない比較は出さない(3 分の 1 の各群が 3 日未満、平日・休日が 3 日未満など)", () => {
    expect(buildAnalysis([feature({}), feature({}), feature({})])).toEqual({});
  });

  it("24 時以降に食べた日と食べなかった日の比べは、当たり前になる数字(摂取・差・夜の kcal)を出さず、夜食のあとの変化だけを出す", () => {
    const features = [
      ...Array.from({ length: 3 }, () => feature({ afterMidnightKcal: 1000, intake: 3000, nextSleep: 330, nextWeightChange: 0.3 })),
      ...Array.from({ length: 3 }, () => feature({ afterMidnightKcal: 0, nextSleep: 420, nextWeightChange: -0.1 })),
    ];
    const analysis = buildAnalysis(features) as Record<string, Record<string, Record<string, unknown>>>;
    const group = analysis["24時以降に食べた日と食べなかった日(夜食のあとの変化)"];
    expect(group.食べた日).toMatchObject({ 日数: 3, "翌日の睡眠時間の平均(分)": 330, "翌日の体重の変化の平均(kg)": 0.3 });
    expect(group.食べた日).not.toHaveProperty("摂取kcalの平均");
    expect(group.食べた日).not.toHaveProperty("差の平均");
    expect(group.食べた日).not.toHaveProperty("24時以降のkcalの平均");
  });

  it("平日と休日は、各群 3 日以上のとき、摂取などの平均を並べる。時刻は HH:MM", () => {
    const features = [
      ...Array.from({ length: 3 }, (_, i) => feature({ dow: i, intake: 2600, first: 13 * 60 })),
      ...Array.from({ length: 3 }, (_, i) => feature({ dow: 5 + (i % 2), intake: 1900, first: 11 * 60 + 30 })),
    ];
    const group = (buildAnalysis(features) as Record<string, Record<string, Record<string, unknown>>>)["平日と休日"];
    expect(group.平日).toMatchObject({ 日数: 3, 摂取kcalの平均: 2600, "1食目の時刻の平均": "13:00" });
    expect(group.休日).toMatchObject({ 日数: 3, 摂取kcalの平均: 1900, "1食目の時刻の平均": "11:30" });
  });
});

describe("buildReportInput", () => {
  it("期間・バッジ・集計・日ごとの記録・分析材料・記録のない日を、そろえて返す。JSON にできる", () => {
    const input = buildReportInput({ period, dates, views, source, recordedDates: recorded, badges: [{ key: "sleep", tier: "gold", passed: 5, judged: 5, unit: "day" }] });
    expect(input.期間).toEqual({ 開始: "2026-10-29", 終了: "2026-11-04", 日数: 7 });
    expect(input.バッジ).toEqual([{ 項目: "睡眠", 段階: "ゴールド", 収まった数: 5, 判定した数: 5 }]);
    expect(input.集計).toMatchObject({ 記録のある日数: 4, 食事を記録した日数: 2, 運動の回数: 1, 運動した日数: 1 });
    expect(input.記録のない日).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(JSON.parse(JSON.stringify(input))).toEqual(input);
  });
});
