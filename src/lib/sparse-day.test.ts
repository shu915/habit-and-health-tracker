import { describe, expect, it } from "vitest";
import { hasEnoughDays, isSparseDay, MIN_VALID_DAYS, neededValidDays, SPARSE_LOW_INTAKE_RATIO, SPARSE_MIN_MEALS, sparseReason } from "./sparse-day";

describe("sparseReason(データが不足している日)", () => {
  it("食事が 1 回だけの日は、不足(もれの可能性が高い)。2 回あれば、数字が普通なら、不足ではない", () => {
    expect(SPARSE_MIN_MEALS).toBe(2);
    expect(sparseReason({ mealCount: 1, intakeKcal: 700, targetKcal: 2000 })).toBe("one-meal");
    expect(sparseReason({ mealCount: 1, intakeKcal: 2500, targetKcal: 2000 })).toBe("one-meal"); // 1 回で大量でも、回数で不足とみなす
    expect(sparseReason({ mealCount: 2, intakeKcal: 1600, targetKcal: 2000 })).toBeNull();
  });

  it("食事が 2 回以上でも、摂取が目標の 6 割未満なら、不足(カロリーでの判定)。ちょうど 6 割は、不足ではない", () => {
    expect(SPARSE_LOW_INTAKE_RATIO).toBe(0.6);
    expect(sparseReason({ mealCount: 3, intakeKcal: 1199, targetKcal: 2000 })).toBe("low-intake");
    expect(sparseReason({ mealCount: 3, intakeKcal: 1200, targetKcal: 2000 })).toBeNull();
  });

  it("食事の記録が無い日は、不足とは言わない(「記録なし」は別の表示)", () => {
    expect(sparseReason({ mealCount: 0, intakeKcal: null, targetKcal: 2000 })).toBeNull();
    expect(sparseReason({ mealCount: 0, intakeKcal: 0, targetKcal: 2000 })).toBeNull();
  });

  it("目標となるカロリーが分からない(未設定など)日は、カロリーでは判定しない。回数だけで見る", () => {
    expect(sparseReason({ mealCount: 3, intakeKcal: 300, targetKcal: null })).toBeNull();
    expect(sparseReason({ mealCount: 3, intakeKcal: 300, targetKcal: 0 })).toBeNull();
    expect(sparseReason({ mealCount: 1, intakeKcal: 300, targetKcal: null })).toBe("one-meal");
  });

  it("isSparseDay は、理由があるかどうか", () => {
    expect(isSparseDay({ mealCount: 1, intakeKcal: 500, targetKcal: 2000 })).toBe(true);
    expect(isSparseDay({ mealCount: 3, intakeKcal: 1900, targetKcal: 2000 })).toBe(false);
  });
});

describe("neededValidDays / hasEnoughDays(集計を出すのに要る、データがそろった日の数)", () => {
  it("最低 3 日、かつ、過ぎた日の 3 分の 1 以上(切り上げ)。7 日なら 3 日、28 日なら 10 日、90 日なら 30 日", () => {
    expect(MIN_VALID_DAYS).toBe(3);
    expect(neededValidDays(0)).toBe(3);
    expect(neededValidDays(6)).toBe(3);
    expect(neededValidDays(7)).toBe(3);
    expect(neededValidDays(9)).toBe(3);
    expect(neededValidDays(10)).toBe(4);
    expect(neededValidDays(28)).toBe(10);
    expect(neededValidDays(90)).toBe(30);
  });
  it("足りなければ false(不正確な値で集計しない)。ちょうど足りれば true", () => {
    expect(hasEnoughDays(2, 6)).toBe(false);
    expect(hasEnoughDays(3, 6)).toBe(true);
    expect(hasEnoughDays(9, 28)).toBe(false); // 記録が 28 日中 9 日だけ
    expect(hasEnoughDays(10, 28)).toBe(true);
    expect(hasEnoughDays(0, 0)).toBe(false);
  });
});
