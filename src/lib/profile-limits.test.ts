import { describe, expect, it } from "vitest";
import { formatRange, isWithin, PROFILE_LIMITS, type LimitedField } from "./profile-limits";
import { ACTIVITY_LEVEL_OPTIONS } from "./profile-options";

describe("isWithin", () => {
  it("内側にあれば true、はみ出せば false", () => {
    expect(isWithin({ min: 5, max: 120 }, { min: 0, max: 150 })).toBe(true);
    expect(isWithin({ min: 0, max: 120 }, { min: 5, max: 150 })).toBe(false);
    expect(isWithin({ min: 5, max: 151 }, { min: 0, max: 150 })).toBe(false);
  });

  it("同じ端でも、外側が除外(より大きい / より小さい)なら、内側は含んではいけない", () => {
    expect(isWithin({ min: 0, max: 10 }, { min: 0, max: 100, minExclusive: true })).toBe(false); // 0 を含む vs 0 を含まない
    expect(isWithin({ min: 0, max: 10, minExclusive: true }, { min: 0, max: 100, minExclusive: true })).toBe(true);
    expect(isWithin({ min: 1, max: 500 }, { min: 0, max: 500, maxExclusive: true })).toBe(false); // 500 を含む vs 含まない
    expect(isWithin({ min: 1, max: 500, maxExclusive: true }, { min: 0, max: 500, maxExclusive: true })).toBe(true);
  });

  it("外側が含む端なら、内側は含んでも除外でもよい", () => {
    expect(isWithin({ min: 0, max: 10 }, { min: 0, max: 10 })).toBe(true);
    expect(isWithin({ min: 0, max: 10, minExclusive: true }, { min: 0, max: 10 })).toBe(true);
  });
});

describe("PROFILE_LIMITS", () => {
  const fields = Object.keys(PROFILE_LIMITS) as LimitedField[];

  it.each(fields)("%s: アプリの範囲は DB の範囲の内側にある(検証を通った値が DB に拒否されない)", (field) => {
    const { app, db } = PROFILE_LIMITS[field];
    expect(isWithin(app, db), `${field}: app=${JSON.stringify(app)} db=${JSON.stringify(db)}`).toBe(true);
  });

  it("活動係数の選択肢は、アプリの範囲の端と一致する(選択肢を変えたら範囲も直す)", () => {
    const values = ACTIVITY_LEVEL_OPTIONS.map((option) => Number(option.value));
    expect(Math.min(...values)).toBe(PROFILE_LIMITS.activityLevel.app.min);
    expect(Math.max(...values)).toBe(PROFILE_LIMITS.activityLevel.app.max);
  });

  it("フォームに出す範囲は「最小〜最大」の形", () => {
    expect(formatRange("age")).toBe("5〜120");
    expect(formatRange("targetCalories")).toBe("500〜10000");
  });
});
