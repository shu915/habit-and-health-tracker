import { describe, expect, it } from "vitest";
import { recentMedian } from "./recent-measures";

const rows = (values: string[]) => values.map((value, i) => ({ date: `2026-11-${String(9 - i).padStart(2, "0")}`, value }));

describe("recentMedian", () => {
  it("新しい順の 5 件の、中央値を出す(極端な値に引きずられない)", () => {
    const result = recentMedian(rows(["98.30", "97.90", "101.50", "98.00", "98.10"]), 2);
    expect(result).toEqual({ value: "98.10", count: 5, from: "2026-11-05", to: "2026-11-09" });
  });

  it("6 件目より古い記録は、使わない", () => {
    const result = recentMedian(rows(["98.00", "98.00", "98.00", "98.00", "98.00", "60.00"]), 2);
    expect(result?.value).toBe("98.00");
    expect(result?.count).toBe(5);
  });

  it("5 件に満たなければ、あるだけで出す。偶数件は、真ん中 2 つの平均", () => {
    expect(recentMedian(rows(["98.00", "99.00"]), 2)).toEqual({ value: "98.50", count: 2, from: "2026-11-08", to: "2026-11-09" });
    expect(recentMedian(rows(["32.0"]), 1)).toEqual({ value: "32.0", count: 1, from: "2026-11-09", to: "2026-11-09" });
  });

  it("小数の桁を、指定にそろえる(体脂肪率は 1 桁)", () => {
    expect(recentMedian(rows(["32.0", "32.4"]), 1)?.value).toBe("32.2");
    expect(recentMedian(rows(["98.3"]), 2)?.value).toBe("98.30"); // DB の桁(2 桁)に、そろえる
  });

  it("記録が無ければ null", () => {
    expect(recentMedian([], 2)).toBeNull();
  });
});
