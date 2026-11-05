import { describe, expect, it } from "vitest";
import { isPastMonth, isReportKind, isYearMonth, MAX_MONTH_CHOICES, monthPeriod, reportEligibility, reportPeriod, requiredRecordedDays, selectableMonths } from "./report-period";

describe("reportPeriod", () => {
  it("随時の直近 4 週間: 今の食事の日の前日まで 28 日(今日は書きかけなので含めない)", () => {
    expect(reportPeriod("four-weeks", "2026-11-05")).toEqual({ kind: "four-weeks", start: "2026-10-08", end: "2026-11-04", days: 28 });
  });
  it("月次: 指定した過去の月の 1 日〜末日。月の日数(28〜31 日)・うるう年・年をまたぐ月に合わせる", () => {
    expect(reportPeriod("monthly", "2026-11-05", "2026-10")).toEqual({ kind: "monthly", start: "2026-10-01", end: "2026-10-31", days: 31 });
    expect(reportPeriod("monthly", "2026-03-01", "2026-02")).toEqual({ kind: "monthly", start: "2026-02-01", end: "2026-02-28", days: 28 });
    expect(reportPeriod("monthly", "2028-03-10", "2028-02")).toEqual({ kind: "monthly", start: "2028-02-01", end: "2028-02-29", days: 29 }); // うるう年
    expect(reportPeriod("monthly", "2026-01-15", "2025-12")).toEqual({ kind: "monthly", start: "2025-12-01", end: "2025-12-31", days: 31 }); // 年をまたぐ
    expect(reportPeriod("monthly", "2026-11-05", "2025-04")).toEqual({ kind: "monthly", start: "2025-04-01", end: "2025-04-30", days: 30 }); // 1 年前の月も選べる
    expect(monthPeriod("2026-12")).toEqual({ kind: "monthly", start: "2026-12-01", end: "2026-12-31", days: 31 });
  });
  it("月次: 今の月・未来の月・月が無い・形が違う値は、呼び出し側の誤りとして例外にする", () => {
    expect(() => reportPeriod("monthly", "2026-11-05")).toThrow("invalid month");
    expect(() => reportPeriod("monthly", "2026-11-05", "2026-11")).toThrow("invalid month"); // 今の月は、まだ終わっていない
    expect(() => reportPeriod("monthly", "2026-11-05", "2026-12")).toThrow("invalid month");
    expect(() => reportPeriod("monthly", "2026-11-05", "2026-13")).toThrow("invalid month");
    expect(() => reportPeriod("monthly", "2026-11-05", "10/2026")).toThrow("invalid month");
  });
});

describe("月の判定", () => {
  it("isYearMonth: 1900〜2100 年の、実在する月だけ", () => {
    expect(["2026-10", "2026-01", "2026-12", "1900-01", "2100-12"].map(isYearMonth)).toEqual([true, true, true, true, true]);
    expect(["2026-00", "2026-13", "2026-1", "26-10", "2026-10-01", "1899-12", "2101-01", "", "abcd-ef"].map(isYearMonth)).toEqual([false, false, false, false, false, false, false, false, false]);
  });
  it("isPastMonth: 今の食事の日の月より前だけ(今の月は、まだ終わっていない)。月初の 3 時前は、まだ前の月", () => {
    expect(isPastMonth("2026-10", "2026-11-05")).toBe(true);
    expect(isPastMonth("2026-11", "2026-11-05")).toBe(false);
    expect(isPastMonth("2025-12", "2026-01-01")).toBe(true);
    // 11/1 の 02:00 の「今の食事の日」は 10/31。10 月は、まだ終わっていない
    expect(isPastMonth("2026-10", "2026-10-31")).toBe(false);
  });
});

describe("selectableMonths(選べる月)", () => {
  it("記録のある最初の月から、先月まで。新しい月が先(初期値は先月)", () => {
    expect(selectableMonths("2026-11-05", "2026-08-20")).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(selectableMonths("2026-01-10", "2025-11-03")).toEqual(["2025-12", "2025-11"]); // 年をまたぐ
  });
  it("記録が無い・最初の記録が今の月なら、選べる月は無い", () => {
    expect(selectableMonths("2026-11-05", null)).toEqual([]);
    expect(selectableMonths("2026-11-05", "2026-11-01")).toEqual([]);
  });
  it(`古い月は、新しい月から ${MAX_MONTH_CHOICES} か月まで`, () => {
    const months = selectableMonths("2026-11-05", "2015-01-01");
    expect(months).toHaveLength(MAX_MONTH_CHOICES);
    expect(months[0]).toBe("2026-10");
    expect(months[MAX_MONTH_CHOICES - 1]).toBe("2024-11");
  });
});

describe("作れる条件(期間の 7 割以上に記録のある日)", () => {
  it("必要な日数: 28 日は 20、29 日は 21、30 日は 21、31 日は 22(7 日は 5)", () => {
    expect([7, 28, 29, 30, 31].map(requiredRecordedDays)).toEqual([5, 20, 21, 21, 22]);
  });
  it("足りていれば ok。足りなければ、あと何日かを返す。期間の外の日は数えない", () => {
    const period = reportPeriod("four-weeks", "2026-11-05"); // 10-08〜11-04
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(8 + i).padStart(2, "0")}`); // 10-08〜10-27
    expect(reportEligibility(period, days)).toEqual({ ok: true, recorded: 20, required: 20, missing: 0 });
    expect(reportEligibility(period, days.slice(0, 15))).toEqual({ ok: false, recorded: 15, required: 20, missing: 5 });
    expect(reportEligibility(period, [...days.slice(0, 15), "2026-10-07", "2026-11-05"]).recorded).toBe(15); // 期間の前後は数えない
    expect(reportEligibility(period, [...days, ...days]).recorded).toBe(20); // 同じ日を二重に数えない
  });
});

describe("isReportKind", () => {
  it("決まった種類だけを通す", () => {
    expect(isReportKind("four-weeks")).toBe(true);
    expect(isReportKind("monthly")).toBe(true);
    expect(isReportKind("last-month")).toBe(false); // 先月だけ → 月次に広げて、改名した
    expect(isReportKind("week")).toBe(false); // 直近 1 週間は、やめた
    expect(isReportKind("year")).toBe(false);
    expect(isReportKind(undefined)).toBe(false);
  });
});

describe("随時レポート(1 日 1 回)", () => {
  it("随時は直近 4 週間だけ。月次は定期", async () => {
    const { ON_DEMAND_DAILY_LIMIT, isOnDemandKind } = await import("./report-period");
    expect(ON_DEMAND_DAILY_LIMIT).toBe(1);
    expect(isOnDemandKind("four-weeks")).toBe(true);
    expect(isOnDemandKind("monthly")).toBe(false);
  });
});
