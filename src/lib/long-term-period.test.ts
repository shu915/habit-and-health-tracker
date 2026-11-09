import { describe, expect, it } from "vitest";
import {
  completedMonths,
  ignoreReleaseDate,
  isReleased,
  longTermEligibility,
  longTermPeriod,
  MAX_LONG_TERM_CHOICES,
  nextRelease,
  releaseDate,
  requiredUsableMonths,
  selectableLongTermPeriods,
} from "./long-term-period";

const quarter = (id: string) => {
  const period = longTermPeriod("quarterly", id);
  if (period === null) throw new Error(`invalid: ${id}`);
  return period;
};

describe("longTermPeriod", () => {
  it("四半期: 暦に固定(1〜3 月、4〜6 月、7〜9 月、10〜12 月)。月と開始日・終了日を持つ", () => {
    expect(quarter("2026-Q1")).toMatchObject({ start: "2026-01-01", end: "2026-03-31", months: ["2026-01", "2026-02", "2026-03"] });
    expect(quarter("2026-Q2")).toMatchObject({ start: "2026-04-01", end: "2026-06-30" });
    expect(quarter("2026-Q3")).toMatchObject({ start: "2026-07-01", end: "2026-09-30", title: "2026 年 7〜9 月(第 3 四半期)" });
    expect(quarter("2026-Q4")).toMatchObject({ start: "2026-10-01", end: "2026-12-31", months: ["2026-10", "2026-11", "2026-12"] });
  });

  it("年: 1〜12 月(12 か月)。うるう年の 2 月も数える", () => {
    const year = longTermPeriod("yearly", "2026");
    expect(year).toMatchObject({ kind: "yearly", start: "2026-01-01", end: "2026-12-31", title: "2026 年" });
    expect(year?.months).toHaveLength(12);
    expect(quarter("2028-Q1").end).toBe("2028-03-31");
  });

  it("形が違う id・範囲外の年は null", () => {
    for (const id of ["2026-Q5", "2026-Q0", "26-Q1", "2026-q1", "2026", "2026-1", "", "2101-Q1", "1899-Q1"]) expect(longTermPeriod("quarterly", id), id).toBeNull();
    for (const id of ["202", "20260", "2026-Q1", "abcd", "2101", "1899"]) expect(longTermPeriod("yearly", id), id).toBeNull();
  });
});

describe("解禁日", () => {
  it("期間が終わった翌日(4/1・7/1・10/1・1/1)から。前の日は、まだ", () => {
    expect(releaseDate(quarter("2026-Q1"))).toBe("2026-04-01");
    expect(releaseDate(quarter("2026-Q3"))).toBe("2026-10-01");
    expect(releaseDate(quarter("2026-Q4"))).toBe("2027-01-01");
    expect(releaseDate(longTermPeriod("yearly", "2026")!)).toBe("2027-01-01");
    expect(isReleased(quarter("2026-Q3"), "2026-09-30")).toBe(false);
    expect(isReleased(quarter("2026-Q3"), "2026-10-01")).toBe(true);
    expect(isReleased(quarter("2026-Q3"), "2027-03-01")).toBe(true);
  });

  it("終わった月だけを数える(解禁された期間は、全部の月が終わっている)", () => {
    expect(completedMonths(quarter("2026-Q4"), "2026-11-09")).toEqual(["2026-10"]);
    expect(completedMonths(quarter("2026-Q4"), "2027-01-01")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(completedMonths(quarter("2026-Q4"), "2026-10-15")).toEqual([]);
  });

  it("開発のときだけ、環境変数で解禁日を無視できる(本番では、変数があっても無視)", () => {
    expect(ignoreReleaseDate({ NODE_ENV: "development", REPORT_IGNORE_RELEASE_DATE: "1" })).toBe(true);
    expect(ignoreReleaseDate({ NODE_ENV: "production", REPORT_IGNORE_RELEASE_DATE: "1" })).toBe(false);
    expect(ignoreReleaseDate({ NODE_ENV: "test", REPORT_IGNORE_RELEASE_DATE: "1" })).toBe(false);
    expect(ignoreReleaseDate({ NODE_ENV: "development" })).toBe(false);
    expect(ignoreReleaseDate({ NODE_ENV: "development", REPORT_IGNORE_RELEASE_DATE: "true" })).toBe(false);
    expect(ignoreReleaseDate({})).toBe(false);
  });
});

describe("selectableLongTermPeriods", () => {
  const today = "2026-11-09";
  const earliest = "2025-10-06"; // デモの人物の、記録のある最初の日

  it("四半期: 記録のある最初の月を含む期間から、解禁された最新の期間まで。新しい期間が先", () => {
    const ids = selectableLongTermPeriods("quarterly", today, earliest).map((c) => c.period.id);
    expect(ids).toEqual(["2026-Q3", "2026-Q2", "2026-Q1", "2025-Q4"]);
    expect(selectableLongTermPeriods("quarterly", today, earliest).every((c) => c.released)).toBe(true);
  });

  it("年: 2025 年だけ(2026 年は、まだ終わっていない)", () => {
    expect(selectableLongTermPeriods("yearly", today, earliest).map((c) => c.period.id)).toEqual(["2025"]);
  });

  it("開発用に解禁日を無視すると、今の期間(終わった月だけ使う)も入る。解禁前と分かる", () => {
    const quarterly = selectableLongTermPeriods("quarterly", today, earliest, { ignoreRelease: true });
    expect(quarterly[0]).toMatchObject({ period: { id: "2026-Q4" }, released: false, releaseDate: "2027-01-01" });
    expect(selectableLongTermPeriods("yearly", today, earliest, { ignoreRelease: true }).map((c) => [c.period.id, c.released])).toEqual([["2026", false], ["2025", true]]);
  });

  it("今の期間が、まだ 1 か月も終わっていなければ、無視しても入らない", () => {
    const ids = selectableLongTermPeriods("quarterly", "2026-10-15", earliest, { ignoreRelease: true }).map((c) => c.period.id);
    expect(ids[0]).toBe("2026-Q3");
  });

  it("記録が無ければ空。古い期間は、上限の個数で切る", () => {
    expect(selectableLongTermPeriods("quarterly", today, null)).toEqual([]);
    expect(selectableLongTermPeriods("quarterly", today, "2000-01-01")).toHaveLength(MAX_LONG_TERM_CHOICES);
  });

  it("解禁日の当日から、前の期間が選べる(年の境目)", () => {
    expect(selectableLongTermPeriods("yearly", "2026-12-31", "2025-10-06").map((c) => c.period.id)).toEqual(["2025"]);
    expect(selectableLongTermPeriods("yearly", "2027-01-01", "2025-10-06").map((c) => c.period.id)).toEqual(["2026", "2025"]);
  });
});

describe("nextRelease", () => {
  it("今の期間と、解禁日と、あと何日か", () => {
    expect(nextRelease("quarterly", "2026-11-09")).toMatchObject({ period: { id: "2026-Q4" }, releaseDate: "2027-01-01", daysLeft: 53 });
    expect(nextRelease("yearly", "2026-12-31")).toMatchObject({ period: { id: "2026" }, releaseDate: "2027-01-01", daysLeft: 1 });
    expect(nextRelease("quarterly", "2026-09-30")).toMatchObject({ period: { id: "2026-Q3" }, daysLeft: 1 });
  });
});

describe("longTermEligibility", () => {
  const days = (month: string, count: number) => Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  it("使える月の数: 四半期は 3 か月中 2 か月、年は 12 か月中 8 か月", () => {
    expect(requiredUsableMonths(3)).toBe(2);
    expect(requiredUsableMonths(12)).toBe(8);
    expect(requiredUsableMonths(1)).toBe(1);
    expect(requiredUsableMonths(10)).toBe(7);
  });

  it("使える月 = その月の 7 割以上の日に記録がある月(7 月は 31 日なので 22 日。9 月は 30 日なので 21 日)", () => {
    const result = longTermEligibility(["2026-07", "2026-08", "2026-09"], [...days("2026-07", 22), ...days("2026-08", 31), ...days("2026-09", 20)]);
    expect(result.months.map((m) => [m.month, m.recorded, m.required, m.usable])).toEqual([
      ["2026-07", 22, 22, true],
      ["2026-08", 31, 22, true],
      ["2026-09", 20, 21, false], // あと 1 日で使える
    ]);
    expect(result).toMatchObject({ ok: true, usableMonths: ["2026-07", "2026-08"], requiredMonths: 2, missing: 0 }); // 3 か月中 2 か月で、作れる
  });

  it("使える月が足りなければ、作れない。あと何か月かを返す", () => {
    const result = longTermEligibility(["2026-07", "2026-08", "2026-09"], days("2026-08", 31));
    expect(result).toMatchObject({ ok: false, usableMonths: ["2026-08"], requiredMonths: 2, missing: 1 });
  });

  it("月が 1 つも無ければ作れない。月の形が違えば、失敗にする", () => {
    expect(longTermEligibility([], []).ok).toBe(false);
    expect(() => longTermEligibility(["2026-7"], [])).toThrow("invalid month");
  });

  it("期間の外の日付は、数えない", () => {
    const result = longTermEligibility(["2026-07"], [...days("2026-06", 30), ...days("2026-08", 31)]);
    expect(result.months[0].recorded).toBe(0);
  });
});
