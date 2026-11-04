import { describe, expect, it } from "vitest";
import { buildCalorieTrend, calorieAxis, latestBefore, type CalorieInputs } from "./calorie-trend";
import { exerciseKcal } from "./exercise";

const base: CalorieInputs = {
  rows: [],
  intake: new Map(),
  exercises: [],
  priorMorningWeight: null,
  priorStampedTargetKcal: null,
  profileTargetKcal: null,
  profileWeightKg: null,
  isFinishedDay: () => true,
};
const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];

describe("buildCalorieTrend", () => {
  it("食事の無い日の摂取は null(0 にしない)。食事のある日は合計を入れる", () => {
    const points = buildCalorieTrend(dates, { ...base, intake: new Map([["2026-11-02", 1800]]) });
    expect(points.map((p) => p.intake)).toEqual([null, 1800, null]);
  });

  it("目標となるカロリー = その日に固定した目標カロリー + その日の運動の消費", () => {
    const walk = { date: "2026-11-02", type: "walk", intensity: "normal", minutes: 60 };
    const points = buildCalorieTrend(dates, {
      ...base,
      rows: [
        { date: "2026-11-01", morningWeightKg: "70.00", stampedTargetKcal: 2000 },
        { date: "2026-11-02", morningWeightKg: "70.00", stampedTargetKcal: 2000 },
      ],
      exercises: [walk],
    });
    const expected = exerciseKcal("walk", "normal", 60, 70) ?? 0;
    expect(expected).toBeGreaterThan(0);
    expect(points[0]).toMatchObject({ target: 2000, exerciseKcal: 0, baseKcal: 2000 });
    expect(points[1]).toMatchObject({ target: 2000 + expected, exerciseKcal: expected });
  });

  it("目標は、日ごとに固定した値を使う(プロフィールの今の値で上書きしない)。行はあるが固定した値が無い日だけ、今の値で補う", () => {
    const points = buildCalorieTrend(dates, {
      ...base,
      rows: [
        { date: "2026-11-01", morningWeightKg: null, stampedTargetKcal: 2000 },
        { date: "2026-11-02", morningWeightKg: null, stampedTargetKcal: null },
      ],
      profileTargetKcal: 1500,
    });
    expect(points[0].target).toBe(2000);
    expect(points[1].target).toBe(1500); // 行はあるが、固定した値が無い: 今の値(日の詳細と同じ)
  });

  it("日の行が無い、過ぎた日は、それ以前でいちばん新しい固定した目標を引き継ぐ(プロフィールの今の値で過去を書き換えない)", () => {
    const points = buildCalorieTrend(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"], {
      ...base,
      rows: [
        { date: "2026-11-01", morningWeightKg: null, stampedTargetKcal: 1800 },
        { date: "2026-11-04", morningWeightKg: null, stampedTargetKcal: 1500 },
      ],
      profileTargetKcal: 1500, // 今は 1500 に直した
    });
    expect(points.map((p) => p.target)).toEqual([1800, 1800, 1800, 1500]); // 行の無い 11-02・11-03 は、1800 を引き継ぐ(1500 にならない)
  });

  it("期間より前の固定した目標からも引き継ぐ。引き継ぐ元が一度も無ければ、線は出さない(null)", () => {
    const fromBefore = buildCalorieTrend(dates, { ...base, priorStampedTargetKcal: 1800, profileTargetKcal: 1500 });
    expect(fromBefore.map((p) => p.target)).toEqual([1800, 1800, 1800]);
    const nothing = buildCalorieTrend(dates, { ...base, profileTargetKcal: 1500 });
    expect(nothing.map((p) => p.target)).toEqual([null, null, null]);
  });

  it("日の行が無い、今日・未来の日(過ぎていない日)は、今のプロフィールの目標(これからの計画)", () => {
    const points = buildCalorieTrend(dates, {
      ...base,
      rows: [{ date: "2026-11-01", morningWeightKg: null, stampedTargetKcal: 1800 }],
      profileTargetKcal: 1500,
      isFinishedDay: (date) => date < "2026-11-03",
    });
    expect(points.map((p) => p.target)).toEqual([1800, 1800, 1500]); // 11-03 は今日(まだ過ぎていない)
  });

  it("目標カロリーが決まっていなければ、目標は null", () => {
    expect(buildCalorieTrend(dates, base).every((p) => p.target === null)).toBe(true);
    expect(buildCalorieTrend(dates, { ...base, isFinishedDay: () => false }).every((p) => p.target === null)).toBe(true);
  });

  it("運動の消費は、その日の体重で計算する: その日の朝 → それ以前の最新 → プロフィールの体重。後の日の体重は使わない", () => {
    const walk = (date: string) => ({ date, type: "walk", intensity: "normal", minutes: 60 });
    const points = buildCalorieTrend(dates, {
      ...base,
      rows: [{ date: "2026-11-03", morningWeightKg: "50.00", stampedTargetKcal: 2000 }],
      exercises: [walk("2026-11-01"), walk("2026-11-02"), walk("2026-11-03")],
      priorMorningWeight: { weight: "80.00", date: "2026-10-30" },
      profileWeightKg: "99.00",
    });
    expect(points[0].exerciseKcal).toBe(exerciseKcal("walk", "normal", 60, 80)); // 期間より前の朝の体重
    expect(points[1].exerciseKcal).toBe(exerciseKcal("walk", "normal", 60, 80)); // 11-03 の 50kg は、前の日に使わない
    expect(points[2].exerciseKcal).toBe(exerciseKcal("walk", "normal", 60, 50)); // その日の朝の体重
  });

  it("朝の体重がどこにも無ければ、プロフィールの体重。それも無ければ、運動は 0 として足す(計算できない)", () => {
    const walk = { date: "2026-11-01", type: "walk", intensity: "normal", minutes: 60 };
    const withProfile = buildCalorieTrend(["2026-11-01"], { ...base, exercises: [walk], profileWeightKg: "70.00" });
    expect(withProfile[0].exerciseKcal).toBe(exerciseKcal("walk", "normal", 60, 70));
    const row = { date: "2026-11-01", morningWeightKg: null, stampedTargetKcal: 2000 }; // 運動を記録した日には、日の行がある
    const none = buildCalorieTrend(["2026-11-01"], { ...base, rows: [row], exercises: [walk] });
    expect(none[0]).toMatchObject({ exerciseKcal: 0, target: 2000 });
  });

  it("同じ日に運動が複数あれば、消費を足す", () => {
    const e = (minutes: number) => ({ date: "2026-11-01", type: "walk", intensity: "normal", minutes });
    const [point] = buildCalorieTrend(["2026-11-01"], { ...base, exercises: [e(30), e(30)], profileWeightKg: "70.00" });
    expect(point.exerciseKcal).toBe((exerciseKcal("walk", "normal", 30, 70) ?? 0) * 2);
  });
});

describe("calorieAxis", () => {
  const point = (intake: number | null, target: number | null) => ({ date: "d", intake, target, exerciseKcal: 0, baseKcal: target });
  it("0 から始め、最大の値が入るように 500 単位に広げる。目盛りは整数", () => {
    const axis = calorieAxis([point(1800, 2100), point(2650, 2100)]);
    expect(axis.domain).toEqual([0, 3000]);
    expect(axis.ticks).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000]);
  });
  it("3000 を超えたら、1000 おき", () => {
    expect(calorieAxis([point(3200, null)]).ticks).toEqual([0, 1000, 2000, 3000, 4000]);
  });
  it("値が無くても、最小の範囲(0〜1000)を持つ", () => {
    expect(calorieAxis([point(null, null)]).domain).toEqual([0, 1000]);
  });
});

describe("latestBefore(期間の直前の値)", () => {
  const rows = [
    { date: "2026-11-01", weight: "80.00" },
    { date: "2026-11-02", weight: null },
    { date: "2026-11-03", weight: "79.00" },
    { date: "2026-11-04", weight: "78.00" },
  ];
  const pick = (row: (typeof rows)[number]) => row.weight;

  it("最初の日より前で、値のある、いちばん新しい行の値(値の無い行は飛ばす。最初の日の行は含めない)", () => {
    expect(latestBefore(rows, "2026-11-04", pick, "99.00")).toBe("79.00");
    expect(latestBefore(rows, "2026-11-03", pick, "99.00")).toBe("80.00"); // 11-02 は値が無いので飛ばす
  });

  it("取った記録の中に無ければ、fallback(さらに前の分)", () => {
    expect(latestBefore(rows, "2026-11-01", pick, "99.00")).toBe("99.00");
    expect(latestBefore(rows, "2026-11-01", pick, null)).toBeNull();
    expect(latestBefore([], "2026-11-04", pick, "99.00")).toBe("99.00");
  });

  it("期間の末尾が明日にずれて、最初の日が 1 日後ろにずれたとき、ずれて期間の前になった日の記録を拾う", () => {
    expect(latestBefore(rows, "2026-11-04", pick, null)).toBe("79.00"); // 最初の日が 11-04: 11-03 は期間の前
    expect(latestBefore(rows, "2026-11-05", pick, null)).toBe("78.00"); // 1 日ずれて 11-05: 11-04 も期間の前になり、こちらを拾う
  });

  it("固定した目標のような数値にも使える", () => {
    const stamped = [{ date: "2026-11-01", target: 1800 }, { date: "2026-11-02", target: null }];
    expect(latestBefore(stamped, "2026-11-03", (r) => r.target, 2000)).toBe(1800);
  });
});
