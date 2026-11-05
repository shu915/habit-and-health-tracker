import { describe, expect, it } from "vitest";
import { calorieBadge, exerciseBadge, sleepBadge, tierOf, type CalorieDay } from "./report-badges";
import { buildSleepTrend } from "./trend";

const dates = (start: number, count: number) => Array.from({ length: count }, (_, i) => `2026-10-${String(start + i).padStart(2, "0")}`);
const sleepPoints = (rows: { bed: string | null; wake: string | null }[]) => {
  const ds = dates(1, rows.length);
  return buildSleepTrend(ds, new Map(ds.map((d, i) => [d, { bedtime: rows[i].bed, wakeTime: rows[i].wake }])));
};

describe("tierOf", () => {
  it("5 割でブロンズ、7 割でシルバー、9 割でゴールド。5 割未満は無し", () => {
    expect([0.49, 0.5, 0.69, 0.7, 0.89, 0.9, 1].map(tierOf)).toEqual([null, "bronze", "bronze", "silver", "silver", "gold", "gold"]);
  });
});

describe("睡眠のバッジ(睡眠時間 6 時間以上、かつ、中間時刻が目標の ±1 時間以内)", () => {
  const rows = (count: number, bed: string, wake: string) => Array.from({ length: count }, () => ({ bed, wake }));

  it("0:00〜7:00 は出る(中間時刻 3:30、目標 3:15 に近い)", () => {
    expect(sleepBadge(sleepPoints(rows(7, "00:00", "07:00")), "03:15", 7)).toMatchObject({ key: "sleep", tier: "gold", passed: 7, judged: 7 });
  });
  it("2:00〜10:00 は出ない(8 時間でも、中間時刻 6:00 が目標から 2 時間 45 分ずれる)", () => {
    expect(sleepBadge(sleepPoints(rows(7, "02:00", "10:00")), "03:15", 7)).toBeNull();
  });
  it("睡眠時間が 6 時間に届かない日は、収まらない", () => {
    expect(sleepBadge(sleepPoints(rows(7, "01:00", "06:30")), "03:15", 7)).toBeNull(); // 5.5 時間
    expect(sleepBadge(sleepPoints(rows(7, "00:30", "06:30")), "03:15", 7)).toMatchObject({ tier: "gold" }); // ちょうど 6 時間
  });
  it("中間時刻のずれは ±60 分まで(ちょうど 60 分は収まる)", () => {
    // 22:15〜04:15(6 時間)の中間は 01:15 → 目標 03:15 から 120 分
    expect(sleepBadge(sleepPoints(rows(7, "22:15", "04:15")), "03:15", 7)).toBeNull();
    // 0:15〜6:15 の中間は 03:15、1:15〜7:15 は 04:15(ちょうど 60 分)
    expect(sleepBadge(sleepPoints(rows(7, "01:15", "07:15")), "03:15", 7)).toMatchObject({ passed: 7 });
    expect(sleepBadge(sleepPoints(rows(7, "01:30", "07:30")), "03:15", 7)).toBeNull(); // 04:30 は 75 分
  });
  it("目標の中間時刻が無ければ、睡眠時間だけで判定する", () => {
    expect(sleepBadge(sleepPoints(rows(7, "02:00", "10:00")), null, 7)).toMatchObject({ tier: "gold" });
  });
  it("就寝か起床が空の日は判定から外す。判定できた日が期間の 5 割未満なら、バッジは出ない", () => {
    const half = [...rows(3, "00:00", "07:00"), ...Array.from({ length: 4 }, () => ({ bed: null, wake: "07:00" }))];
    expect(sleepBadge(sleepPoints(half), "03:15", 7)).toBeNull(); // 判定できたのは 3 日(7 日の 5 割 = 3.5 日に届かない)
    const enough = [...rows(4, "00:00", "07:00"), ...Array.from({ length: 3 }, () => ({ bed: null, wake: null }))];
    expect(sleepBadge(sleepPoints(enough), "03:15", 7)).toMatchObject({ judged: 4, passed: 4, tier: "gold" });
  });
  it("収まった割合に応じて段階が変わる", () => {
    const mixed = [...rows(5, "00:00", "07:00"), ...rows(2, "02:00", "10:00")]; // 5/7 = 71%
    expect(sleepBadge(sleepPoints(mixed), "03:15", 7)).toMatchObject({ tier: "silver", passed: 5, judged: 7 });
  });
});

describe("カロリーのバッジ(摂取が目標となるカロリーの 85%〜115%)", () => {
  const day = (i: number, intake: number | null, target: number | null, mealCount = 3, inProgress = false): CalorieDay => ({ date: dates(1, 30)[i], intake, target, mealCount, inProgress });

  it("85% と 115% の境目は含む。それを外れる日(極端に少ない・暴飲暴食)は収まらない", () => {
    const days = [day(0, 1700, 2000), day(1, 2300, 2000), day(2, 1699, 2000), day(3, 2301, 2000), day(4, 1000, 2000), day(5, 4000, 2000)];
    expect(calorieBadge(days, 6)).toBeNull(); // 2/6 = 33%
    expect(calorieBadge(days.slice(0, 2), 2)).toMatchObject({ key: "calorie", tier: "gold", passed: 2, judged: 2 });
  });
  it("食事が 1 回だけの日・摂取か目標が無い日・書きかけの日は、判定から外す", () => {
    const days = [day(0, 1900, 2000), day(1, 500, 2000, 1), day(2, null, 2000), day(3, 1900, null), day(4, 1900, 2000, 3, true), day(5, 2000, 2000)];
    expect(calorieBadge(days, 6)).toBeNull(); // 判定できたのは 2 日(6 日の 5 割 = 3 日に届かない)
    expect(calorieBadge(days, 4)).toMatchObject({ judged: 2, passed: 2 });
  });
  it("目標が 0 以下の日は判定しない", () => {
    expect(calorieBadge([day(0, 1000, 0)], 1)).toBeNull();
  });
});

describe("運動のバッジ(その週に、いつもより多く動いた日が 1 日以上)", () => {
  const ds = dates(1, 28);
  it("7 日ずつの週に分け、運動のあった週の割合で段階が決まる", () => {
    // 1 週目・2 週目・3 週目に運動、4 週目に無し: 3/4 = 75% → シルバー
    expect(exerciseBadge(ds, ["2026-10-03", "2026-10-10", "2026-10-17"], 28)).toMatchObject({ key: "exercise", tier: "silver", passed: 3, judged: 4, unit: "week" });
    expect(exerciseBadge(ds, ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-25"], 28)).toMatchObject({ tier: "gold", passed: 4 });
    expect(exerciseBadge(ds, ["2026-10-03"], 28)).toBeNull(); // 1/4
  });
  it("週の境目は、期間の最初の日から 7 日ずつ", () => {
    expect(exerciseBadge(ds, ["2026-10-07", "2026-10-08"], 28)).toMatchObject({ passed: 2 }); // 10-07 は 1 週目の最後、10-08 は 2 週目の最初
  });
  it("満たない端の日(30 日の最後の 2 日など)は判定しない", () => {
    const month = dates(1, 30);
    expect(exerciseBadge(month, ["2026-10-29", "2026-10-30"], 30)).toBeNull(); // 28〜30 日目は、週にならない
    expect(exerciseBadge(month, ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"], 30)).toMatchObject({ judged: 4, tier: "gold" });
  });
  it("期間が 1 週間なら、その週に運動があるかどうか", () => {
    expect(exerciseBadge(dates(1, 7), ["2026-10-04"], 7)).toMatchObject({ judged: 1, passed: 1, tier: "gold" });
    expect(exerciseBadge(dates(1, 7), [], 7)).toBeNull();
  });
});
