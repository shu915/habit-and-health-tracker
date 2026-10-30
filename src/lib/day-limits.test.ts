import { describe, expect, it } from "vitest";
import { DAY_LIMITS, formatDayRange, type DayLimitedField } from "./day-limits";
import { isWithin } from "./profile-limits";

describe("DAY_LIMITS", () => {
  const fields = Object.keys(DAY_LIMITS) as DayLimitedField[];

  it.each(fields)("%s: アプリの範囲は DB の範囲の内側にある(検証を通った値が DB に拒否されない)", (field) => {
    const { app, db } = DAY_LIMITS[field];
    expect(isWithin(app, db), `${field}: app=${JSON.stringify(app)} db=${JSON.stringify(db)}`).toBe(true);
  });

  it("フォームに出す範囲は「最小〜最大」の形", () => {
    expect(formatDayRange("morningWeightKg")).toBe("20〜300");
    expect(formatDayRange("morningBodyFatPercent")).toBe("3〜60");
  });
});
