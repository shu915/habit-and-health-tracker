import { describe, expect, it } from "vitest";
import { clampPage, DAYS_PER_PAGE, lastPage, parsePage } from "./day-pages";

describe("parsePage", () => {
  it("正の整数はそのまま", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("3")).toBe(3);
  });
  it("読めない値・0・負・小数・配列・未指定は 1", () => {
    for (const raw of ["0", "-2", "1.5", "abc", "", "1e2", "0x10", "9999999", ["2", "3"], undefined]) { // 7 桁以上は読めない値として 1
      expect(parsePage(raw), String(raw)).toBe(1);
    }
  });
});

describe("lastPage(記録の件数から)", () => {
  it("記録が無くても 1 ページ", () => {
    expect(lastPage(0)).toBe(1);
  });
  it("14 件までは 1 ページ、15 件で 2 ページ", () => {
    expect(lastPage(1)).toBe(1);
    expect(lastPage(DAYS_PER_PAGE)).toBe(1);
    expect(lastPage(DAYS_PER_PAGE + 1)).toBe(2);
    expect(lastPage(DAYS_PER_PAGE * 3)).toBe(3);
    expect(lastPage(DAYS_PER_PAGE * 3 + 1)).toBe(4);
  });
});

describe("clampPage", () => {
  it("最後のページより先は、最後のページに寄せる(7 桁以上の値は parsePage が 1 にする)", () => {
    expect(clampPage(parsePage("999999"), 4)).toBe(4);
    expect(clampPage(2, 4)).toBe(2);
    expect(clampPage(1, 1)).toBe(1);
  });
});
