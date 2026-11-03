import { describe, expect, it } from "vitest";
import { clampPage, datesDescending, DAYS_PER_PAGE, lastPage, pageDates, pageRange, parsePage } from "./day-pages";

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

describe("pageRange", () => {
  it("1 ページ目は今日までの 14 日", () => {
    expect(pageRange("2026-11-03", 1)).toEqual({ from: "2026-10-21", to: "2026-11-03" });
  });
  it("2 ページ目は、その直前の 14 日(重ならず、すき間も無い)", () => {
    expect(pageRange("2026-11-03", 2)).toEqual({ from: "2026-10-07", to: "2026-10-20" });
  });
  it("どのページも 14 日分", () => {
    const { from, to } = pageRange("2026-03-01", 3);
    expect(datesDescending(from, to)).toHaveLength(DAYS_PER_PAGE);
  });
});

describe("datesDescending", () => {
  it("新しい順に、月またぎ・うるう日も含めて並べる", () => {
    expect(datesDescending("2028-02-27", "2028-03-01")).toEqual(["2028-03-01", "2028-02-29", "2028-02-28", "2028-02-27"]);
  });
  it("1 日だけ", () => {
    expect(datesDescending("2026-11-03", "2026-11-03")).toEqual(["2026-11-03"]);
  });
});

describe("lastPage", () => {
  const today = "2026-11-03";
  it("記録が無い・最初の記録が今日以降なら 1", () => {
    expect(lastPage(today, null)).toBe(1);
    expect(lastPage(today, today)).toBe(1);
    expect(lastPage(today, "2026-11-04")).toBe(1);
  });
  it("最初の記録が 1 ページ目の最初の日なら 1、その前の日なら 2", () => {
    expect(lastPage(today, "2026-10-21")).toBe(1);
    expect(lastPage(today, "2026-10-20")).toBe(2);
  });
  it("最後のページの範囲に、最初の記録の日が入る", () => {
    for (const first of ["2026-08-01", "2026-01-15", "2025-11-03", "2026-10-07"]) {
      const page = lastPage(today, first);
      const { from, to } = pageRange(today, page);
      expect(first >= from && first <= to, first).toBe(true);
    }
  });
});

describe("clampPage", () => {
  it("最後のページより先は、最後のページに寄せる(6 桁の最大でも)", () => {
    expect(clampPage(parsePage("999999"), 4)).toBe(4);
    expect(clampPage(2, 4)).toBe(2);
    expect(clampPage(1, 1)).toBe(1);
  });
});

describe("pageDates の開始日", () => {
  const today = "2026-11-03";
  it("開始日(最初の記録の日)より前の空の日は出さない", () => {
    const dates = pageDates(today, 1, new Set(["2026-10-28"]), "2026-10-28");
    expect(dates).toEqual(["2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29", "2026-10-28"]);
  });
  it("開始日が前のページにあれば、このページは 14 日そろって出る", () => {
    expect(pageDates(today, 1, new Set(), "2026-09-01")).toHaveLength(DAYS_PER_PAGE);
  });
  it("最後のページも、開始日までで止まる", () => {
    const dates = pageDates(today, 2, new Set(["2026-10-15"]), "2026-10-15");
    expect(dates[dates.length - 1]).toBe("2026-10-15");
    expect(dates).toHaveLength(6);
  });
});

describe("pageDates の初日", () => {
  it("初日の記録がサーバーの明日だけでも、今日の行は残る(記録するリンクが消えない)", () => {
    expect(pageDates("2026-11-03", 1, new Set(["2026-11-04"]), "2026-11-04")).toEqual(["2026-11-04", "2026-11-03"]);
  });
});

describe("pageDates", () => {
  const today = "2026-11-03";
  it("1 ページ目は、記録の無い明日を出さない", () => {
    const dates = pageDates(today, 1, new Set(), null);
    expect(dates[0]).toBe("2026-11-03");
    expect(dates).toHaveLength(DAYS_PER_PAGE);
  });
  it("1 ページ目は、記録のある明日だけ先頭に足す(サーバーが利用者より遅れているとき)", () => {
    const dates = pageDates(today, 1, new Set(["2026-11-04"]), "2026-09-01");
    expect(dates.slice(0, 2)).toEqual(["2026-11-04", "2026-11-03"]);
    expect(dates).toHaveLength(DAYS_PER_PAGE + 1);
  });
  it("2 ページ目以降は、明日の記録があっても足さず、14 日のまま", () => {
    const dates = pageDates(today, 2, new Set(["2026-11-04"]), "2026-09-01");
    expect(dates).toHaveLength(DAYS_PER_PAGE);
    expect(dates).not.toContain("2026-11-04");
  });
});
