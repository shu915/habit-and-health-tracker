import { describe, expect, it } from "vitest";
import { buildExerciseSummary, periodActivityLevel } from "./report-exercise";

// 2026-10-01 から 10 日間
const dates = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const weights = new Map(dates.map((d) => [d, 70]));

const summary = (exercises: { date: string; type: string; intensity: string; minutes: number }[], activityLevel: string | null = "1.375", weightByDate: ReadonlyMap<string, number> = weights) =>
  buildExerciseSummary({ dates, exercises, weightByDate, activityLevel });

describe("buildExerciseSummary", () => {
  const exercises = [
    { date: "2026-10-01", type: "strength", intensity: "hard", minutes: 60 },
    { date: "2026-10-02", type: "strength", intensity: "hard", minutes: 45 },
    { date: "2026-10-03", type: "walk", intensity: "light", minutes: 30 },
    { date: "2026-10-08", type: "strength", intensity: "normal", minutes: 50 },
    { date: "2026-10-08", type: "walk", intensity: "normal", minutes: 20 },
  ];

  it("種類別の回数・日数・合計分を、回数の多い順に出す", () => {
    expect(summary(exercises).種類別).toEqual([
      { 種類: "筋トレ", 回数: 3, 日数: 3, 合計分: 155 },
      { 種類: "散歩", 回数: 2, 日数: 2, 合計分: 50 },
    ]);
  });

  it("強さ別の回数を、使っていない強さも 0 で出す", () => {
    expect(summary(exercises).強さ別の回数).toEqual({ 軽め: 1, 普通: 2, ハード: 2 });
  });

  it("期間を 7 日ずつに区切った週ごとに、運動した日数と合計分を出す(最後の週は日数が少ない)", () => {
    expect(summary(exercises).週ごと).toEqual([
      { 週: "2026-10-01〜2026-10-07", 日数: 7, 運動した日数: 3, 合計分: 135 },
      { 週: "2026-10-08〜2026-10-10", 日数: 3, 運動した日数: 1, 合計分: 70 },
    ]);
  });

  it("連続した日数: 運動した日、運動の記録がない日、ハードな運動の日", () => {
    const result = summary(exercises);
    expect(result.最長の連続運動日数).toBe(3); // 10/1〜10/3
    expect(result["運動の記録がない日が続いた最長の日数"]).toBe(4); // 10/4〜10/7
    expect(result.ハードな運動が続いた最長の日数).toBe(2); // 10/1〜10/2
  });

  it("運動の記録が無い期間は、回数 0・連続 0・休みが期間いっぱい(消費は null)", () => {
    const result = summary([]);
    expect(result).toMatchObject({ 運動の回数: 0, 運動した日数: 0, 種類別: [], 最長の連続運動日数: 0, 運動で増えた消費の合計kcal: null });
    expect(result["運動の記録がない日が続いた最長の日数"]).toBe(10);
  });

  it("運動で増えた消費の合計: (MET − 1) × 体重 × 時間。体重が空の日は、前の日(なければ最初に分かった日)の体重を使う", () => {
    // 筋トレ・ハード(MET 6.0)60 分・70kg → 5 × 70 × 1 = 350
    expect(summary([{ date: "2026-10-05", type: "strength", intensity: "hard", minutes: 60 }]).運動で増えた消費の合計kcal).toBe(350);
    // 10/5 の体重が空で、10/9 だけ分かる → 最初に分かった値(70)を使う
    expect(summary([{ date: "2026-10-05", type: "strength", intensity: "hard", minutes: 60 }], "1.375", new Map([["2026-10-09", 70]])).運動で増えた消費の合計kcal).toBe(350);
    // 体重がどの日にも無ければ、計算できない
    expect(summary([{ date: "2026-10-05", type: "strength", intensity: "hard", minutes: 60 }], "1.375", new Map()).運動で増えた消費の合計kcal).toBeNull();
  });

  it("活動係数: 値と意味(選択肢の名前と説明)を出す。無ければ null", () => {
    expect(summary([], "1.200").活動係数).toEqual({ 値: 1.2, 意味: "座りがち(運動はほとんどしない)" });
    expect(summary([], "1.550").活動係数).toEqual({ 値: 1.55, 意味: "ふつう(週3〜5回の運動)" });
    expect(summary([], null).活動係数).toBeNull();
  });
});

describe("periodActivityLevel", () => {
  const rows = (levels: (string | null)[]) => levels.map((level, i) => ({ date: dates[i], profileActivityLevel: level }));

  it("期間の日に固定した値のうち、いちばん多いもの", () => {
    expect(periodActivityLevel(rows(["1.200", "1.375", "1.375"]), dates, "1.725")).toBe("1.375");
  });

  it("同数なら、新しい日の値", () => {
    expect(periodActivityLevel(rows(["1.200", "1.375"]), dates, null)).toBe("1.375");
  });

  it("期間の外の日は数えない。固定した値が無ければ、今のプロフィールの値", () => {
    expect(periodActivityLevel([{ date: "2026-09-01", profileActivityLevel: "1.900" }], dates, "1.550")).toBe("1.550");
    expect(periodActivityLevel(rows([null, null]), dates, "1.550")).toBe("1.550");
    expect(periodActivityLevel([], dates, null)).toBeNull();
  });
});
