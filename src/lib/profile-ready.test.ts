import { describe, expect, it } from "vitest";
import { isProfileReady } from "./profile-ready";

describe("isProfileReady", () => {
  it("目標カロリーと活動係数がそろっているときだけ、記録を始められる", () => {
    expect(isProfileReady({ targetCalories: 1800, activityLevel: "1.375" })).toBe(true);
    expect(isProfileReady({ targetCalories: null, activityLevel: "1.375" })).toBe(false);
    expect(isProfileReady({ targetCalories: 1800, activityLevel: null })).toBe(false);
    expect(isProfileReady({ targetCalories: null, activityLevel: null })).toBe(false);
  });
});
