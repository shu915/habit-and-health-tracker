import { describe, expect, it } from "vitest";
import {
  EXERCISE_INTENSITIES,
  EXERCISE_INTENSITY_KEYS,
  EXERCISE_TYPES,
  EXERCISE_TYPE_KEYS,
  MET,
  exerciseIntensityLabel,
  exerciseKcal,
  exerciseTypeLabel,
  isExerciseIntensity,
  isExerciseType,
} from "./exercise";

describe("運動の種類・強さ", () => {
  it("種類は 散歩(非定期)・室内エクササイズ・筋トレ・その他、強さは 軽め・普通・ハード", () => {
    expect(EXERCISE_TYPES.map((type) => type.label)).toEqual(["散歩(非定期)", "室内エクササイズ", "筋トレ", "その他"]);
    expect(EXERCISE_INTENSITIES.map((intensity) => intensity.label)).toEqual(["軽め", "普通", "ハード"]);
  });

  it("MET の表は、すべての種類 × 強さを持ち、強いほど大きく、安静(1)より大きい", () => {
    for (const type of EXERCISE_TYPE_KEYS) {
      const row = MET[type as keyof typeof MET];
      expect(Object.keys(row).sort()).toEqual([...EXERCISE_INTENSITY_KEYS].sort());
      expect(row.light).toBeGreaterThan(1);
      expect(row.light).toBeLessThan(row.normal);
      expect(row.normal).toBeLessThan(row.hard);
    }
  });

  it("キーの判定と、画面に出す名前(一覧にないキーは、そのまま返して記録を読めるままにする)", () => {
    expect(isExerciseType("walk")).toBe(true);
    expect(isExerciseType("swim")).toBe(false);
    expect(isExerciseIntensity("hard")).toBe(true);
    expect(isExerciseIntensity("")).toBe(false);
    expect(exerciseTypeLabel("strength")).toBe("筋トレ");
    expect(exerciseTypeLabel("retired-type")).toBe("retired-type");
    expect(exerciseIntensityLabel("light")).toBe("軽め");
  });
});

describe("exerciseKcal(増えた分の消費 = (MET − 1) × 体重 × 時間)", () => {
  it("散歩・普通(MET 3.5)を 60 分、体重 70kg → 2.5 × 70 × 1 = 175 kcal", () => {
    expect(exerciseKcal("walk", "normal", 60, 70)).toBe(175);
  });

  it("時間は比例する(30 分なら半分)。整数に丸める", () => {
    expect(exerciseKcal("walk", "normal", 30, 70)).toBe(88); // 87.5 → 88
    expect(exerciseKcal("walk", "normal", 45, 70)).toBe(131); // 131.25
  });

  it("強さと種類で変わる(筋トレ・ハード MET 6.0 を 30 分、60kg → 5 × 60 × 0.5 = 150)", () => {
    expect(exerciseKcal("strength", "hard", 30, 60)).toBe(150);
    expect(exerciseKcal("walk", "light", 60, 60)).toBe(108); // 1.8 × 60
    expect(exerciseKcal("other", "normal", 60, 60)).toBe(180); // 3.0 × 60
  });

  it("安静の 1 MET は引く(MET をそのまま掛けた値より小さい)", () => {
    const gross = MET.walk.normal * 70 * 1;
    expect(exerciseKcal("walk", "normal", 60, 70)).toBeLessThan(gross);
  });

  const base = { type: "walk", intensity: "normal", minutes: 30, weightKg: 70 as number | null };
  it.each([
    ["体重が分からない", { weightKg: null }],
    ["体重が 0", { weightKg: 0 }],
    ["体重が負", { weightKg: -5 }],
    ["体重が数でない", { weightKg: Number.NaN }],
    ["種類が一覧にない", { type: "swim" }],
    ["強さが一覧にない", { intensity: "easy" }],
    ["時間が 0", { minutes: 0 }],
    ["時間が負", { minutes: -10 }],
    ["時間が数でない", { minutes: Number.NaN }],
  ])("計算できないときは null: %s", (_label, change) => {
    const { type, intensity, minutes, weightKg } = { ...base, ...change };
    expect(exerciseKcal(type, intensity, minutes, weightKg)).toBeNull();
  });
});
