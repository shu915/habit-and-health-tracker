import { describe, expect, it } from "vitest";
import { isValidDateString } from "./date";

describe("isValidDateString", () => {
  it("実在する日付を受け付ける", () => {
    expect(isValidDateString("2026-10-21")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true); // うるう年
  });

  it("実在しない日付を拒否する", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2027-02-29")).toBe(false); // うるう年ではない
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
  });

  it("YYYY-MM-DD 以外の形を拒否する", () => {
    expect(isValidDateString("abc")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("2026-1-5")).toBe(false);
    expect(isValidDateString("2026-10-21T00:00:00Z")).toBe(false);
    expect(isValidDateString(" 2026-10-21")).toBe(false);
  });
});
