import { describe, expect, it } from "vitest";
import { pickMeasure, pickWeight } from "./day-weight";

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

describe("pickMeasure(体脂肪率)", () => {
  it("体重と同じ順: その日の朝 → それ以前の最新の朝 → プロフィール → なし", () => {
    expect(pickMeasure("22.5", { weight: "23.0", date: "2026-10-01" }, "24.0")).toEqual({ value: 22.5, source: "morning", earlierDate: null });
    expect(pickMeasure(null, { weight: "23.0", date: "2026-10-01" }, "24.0")).toEqual({ value: 23, source: "earlier", earlierDate: "2026-10-01" });
    expect(pickMeasure(null, null, "24.0")).toEqual({ value: 24, source: "profile", earlierDate: null });
    expect(pickMeasure(null, null, null)).toEqual({ value: null, source: null, earlierDate: null });
  });
});
