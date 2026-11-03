import { describe, expect, it } from "vitest";
import { dayResult, isFinishedDay, type DayResultInput } from "./day-result";
import type { EnergyOverview } from "./energy-overview";

const ready: EnergyOverview = {
  kind: "ready",
  tdeeKcal: 2400,
  bmrKcal: 1700,
  method: "mifflin-st-jeor",
  activityLevel: 1.4,
  activityName: "軽い",
  targetCalories: 2000,
  targetDiffKcal: -400,
};

const base: DayResultInput = {
  meals: [
    { kcal: 600, proteinG: "30.5" },
    { kcal: 900, proteinG: "40.0" },
  ],
  exercises: [],
  weightKg: 70,
  energy: ready,
  targetProteinG: 100,
  targetCalories: 2000,
};

// 2026-11-03 の昼(ローカル時間)
const at = (hours: number, day = 3) => new Date(2026, 10, day, hours, 0);

describe("isFinishedDay(結果を出す日)", () => {
  it("今日と未来は出さず、前の日からは出す", () => {
    const now = at(12);
    expect(isFinishedDay("2026-11-04", now)).toBe(false);
    expect(isFinishedDay("2026-11-03", now)).toBe(false);
    expect(isFinishedDay("2026-11-02", now)).toBe(true);
    expect(isFinishedDay("2026-01-01", now)).toBe(true);
  });

  it("03:00 より前は、まだ前の日の食事の時間なので、前の日も出さない", () => {
    const now = at(1); // 2026-11-03 01:00 → 「今の食事の日」は 11-02
    expect(isFinishedDay("2026-11-02", now)).toBe(false);
    expect(isFinishedDay("2026-11-01", now)).toBe(true);
  });

  it("03:00 になれば、前の日は結果を出す", () => {
    expect(isFinishedDay("2026-11-02", at(3))).toBe(true);
  });
});

describe("dayResult", () => {
  it("摂取(食事の合計)と、消費の目安、その差を出す", () => {
    const result = dayResult(base);
    expect(result.mealCount).toBe(2);
    expect(result.intakeKcal).toBe(1500);
    expect(result.proteinG).toBe(70.5);
    expect(result.burn).toEqual({ tdeeKcal: 2400, exerciseKcal: 0, totalKcal: 2400, exerciseUncalculated: false });
    expect(result.diffKcal).toBe(-900); // 摂取 − 消費
  });

  it("運動の消費を、消費の目安に足す((MET − 1) × 体重 × 時間)", () => {
    // 散歩・普通 3.5 MET × 60 分 × 70kg → (3.5 − 1) × 70 × 1 = 175
    const result = dayResult({ ...base, exercises: [{ type: "walk", intensity: "normal", minutes: 60 }] });
    expect(result.burn?.exerciseKcal).toBe(175);
    expect(result.burn?.totalKcal).toBe(2575);
    expect(result.diffKcal).toBe(1500 - 2575);
  });

  it("体重が分からないと、運動の分は足さず、足していないことを示す", () => {
    const result = dayResult({ ...base, weightKg: null, exercises: [{ type: "walk", intensity: "normal", minutes: 60 }] });
    expect(result.burn).toEqual({ tdeeKcal: 2400, exerciseKcal: 0, totalKcal: 2400, exerciseUncalculated: true });
  });

  it("運動が 2 件で、種類が一覧に無い 1 件は、足さずに「計算できない」とする", () => {
    const result = dayResult({
      ...base,
      exercises: [
        { type: "walk", intensity: "normal", minutes: 60 }, // 175
        { type: "swim", intensity: "normal", minutes: 60 }, // 一覧に無い種類
      ],
    });
    expect(result.burn).toEqual({ tdeeKcal: 2400, exerciseKcal: 175, totalKcal: 2575, exerciseUncalculated: true });
  });

  it("摂取と消費が同じなら、差は 0", () => {
    const result = dayResult({ ...base, meals: [{ kcal: 2400, proteinG: "50.0" }] });
    expect(result.diffKcal).toBe(0);
  });

  it("食事の記録が無い日は、差を出さない(大きな赤字に見せない)", () => {
    const result = dayResult({ ...base, meals: [] });
    expect(result.mealCount).toBe(0);
    expect(result.intakeKcal).toBe(0);
    expect(result.diffKcal).toBeNull();
  });

  it("プロフィールが足りず、消費が出せないときは、摂取だけを出す", () => {
    const missing: EnergyOverview = { kind: "missing", missing: ["身長"] };
    const needsActivity: EnergyOverview = { kind: "needs-activity", bmrKcal: 1700, method: "mifflin-st-jeor" };
    for (const energy of [missing, needsActivity]) {
      const result = dayResult({ ...base, energy });
      expect(result.intakeKcal).toBe(1500);
      expect(result.burn).toBeNull();
      expect(result.diffKcal).toBeNull();
    }
  });

  it("たんぱく質は小数 1 桁に丸め、目標を持ち回る", () => {
    const result = dayResult({ ...base, meals: [{ kcal: 100, proteinG: "0.1" }, { kcal: 100, proteinG: "0.2" }], targetProteinG: null });
    expect(result.proteinG).toBe(0.3);
    expect(result.targetProteinG).toBeNull();
  });
});

describe("dayResult の目標となるカロリー", () => {
  it("目標カロリーに、その日の追加の運動の消費を足す(現実の消費の目安とは別の値)", () => {
    const result = dayResult({ ...base, exercises: [{ type: "walk", intensity: "normal", minutes: 60 }] });
    expect(result.target?.baseKcal).toBe(2000);
    expect(result.target?.exerciseKcal).toBeGreaterThan(0);
    expect(result.target?.totalKcal).toBe(2000 + (result.target?.exerciseKcal ?? 0));
    expect(result.burn?.tdeeKcal).toBe(2400); // 消費の目安は別
    expect(result.target?.exerciseKcal).toBe(result.burn?.exerciseKcal);
  });

  it("運動が無ければ目標カロリーのまま。目標が未設定なら null", () => {
    expect(dayResult(base).target).toEqual({ baseKcal: 2000, exerciseKcal: 0, totalKcal: 2000 });
    expect(dayResult({ ...base, targetCalories: null }).target).toBeNull();
  });

  it("消費の目安が出せない(プロフィール不足)日でも、目標は出る", () => {
    const result = dayResult({ ...base, energy: { kind: "missing", missing: ["身長"] } });
    expect(result.burn).toBeNull();
    expect(result.target?.totalKcal).toBe(2000);
  });
});
