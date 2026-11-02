import { describe, expect, it } from "vitest";
import { isMealId, MAX_ID, MEAL_LIMITS, MEAL_TIME_MAX_HOUR, type MealLimitedField } from "./meal-limits";
import { isWithin } from "./profile-limits";

describe("MEAL_LIMITS", () => {
  const fields = Object.keys(MEAL_LIMITS) as MealLimitedField[];

  it.each(fields)("%s: アプリの範囲は DB の範囲の内側にある(検証を通った値が DB に拒否されない)", (field) => {
    const { app, db } = MEAL_LIMITS[field];
    expect(isWithin(app, db), `${field}: app=${JSON.stringify(app)} db=${JSON.stringify(db)}`).toBe(true);
  });

  it("食べた時刻の時の上限は 26(深夜 3 時までは前の日の食事)", () => {
    expect(MEAL_TIME_MAX_HOUR).toBe(26);
  });
});

describe("isMealId", () => {
  it("正の整数で、int4 の範囲(1〜2147483647)なら true", () => {
    expect(isMealId(1)).toBe(true);
    expect(isMealId(MAX_ID)).toBe(true);
    expect(MAX_ID).toBe(2_147_483_647);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, MAX_ID + 1, 9_999_999_999, Number.MAX_SAFE_INTEGER])("%s は false", (id) => {
    expect(isMealId(id)).toBe(false);
  });
});
