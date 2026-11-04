import { describe, expect, it } from "vitest";
import { nextDate } from "./day-nav";

describe("nextDate(次の日の行き先)", () => {
  const today = "2026-11-04";
  it("次の記録の日があれば、そこへ(日が飛んでいてもよい)", () => {
    expect(nextDate("2026-10-28", "2026-11-02", today)).toBe("2026-11-02");
  });
  it("次の記録が無く、今日より前の日なら、今日へ", () => {
    expect(nextDate("2026-11-02", null, today)).toBe("2026-11-04");
    expect(nextDate("2026-11-03", null, today)).toBe("2026-11-04");
  });
  it("今日にいるとき、未来にいるときは出さない(明日へは行かない)", () => {
    expect(nextDate("2026-11-04", null, today)).toBeNull();
    expect(nextDate("2026-11-05", null, today)).toBeNull();
  });
  it("次の記録が明日にあるとき(サーバーとの時差で記録された日)は、そこへ行ける", () => {
    expect(nextDate("2026-11-04", "2026-11-05", today)).toBe("2026-11-05");
  });
});
