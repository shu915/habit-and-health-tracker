import { describe, expect, it } from "vitest";
import { pickWeight } from "./day-weight";

describe("pickWeight", () => {
  it("その日の朝の体重があれば、それを使う", () => {
    expect(pickWeight("70.50", { weight: "71.00", date: "2026-10-01" }, "72.00")).toEqual({ kg: 70.5, source: "morning", earlierDate: null });
  });
  it("朝の体重が無ければ、それ以前でいちばん新しい朝の体重", () => {
    expect(pickWeight(null, { weight: "71.00", date: "2026-10-01" }, "72.00")).toEqual({ kg: 71, source: "earlier", earlierDate: "2026-10-01" });
  });
  it("どちらも無ければ、プロフィールの体重", () => {
    expect(pickWeight(null, null, "72.00")).toEqual({ kg: 72, source: "profile", earlierDate: null });
  });
  it("全部無ければ、体重なし", () => {
    expect(pickWeight(null, null, null)).toEqual({ kg: null, source: null, earlierDate: null });
  });
});
