import { describe, expect, it } from "vitest";
import { buildCalendar, calendarStart, CALENDAR_WEEKS, MAX_LEVEL, RECENT_WEEKS, RECORD_KINDS, weekdayIndex } from "./record-calendar";

describe("weekdayIndex(月曜始まり)", () => {
  it("月曜が 0、日曜が 6", () => {
    expect(weekdayIndex("2026-11-02")).toBe(0); // 月
    expect(weekdayIndex("2026-11-05")).toBe(3); // 木
    expect(weekdayIndex("2026-11-08")).toBe(6); // 日
  });
});

describe("calendarStart", () => {
  it("今日を含む週の月曜から 52 週前の月曜(常に月曜)", () => {
    expect(calendarStart("2026-11-05")).toBe("2025-11-03"); // 今週の月曜 11-02 の 364 日前(52 週)
    expect(weekdayIndex(calendarStart("2026-11-05"))).toBe(0);
    expect(calendarStart("2026-11-02")).toBe("2025-11-03"); // 月曜の当日でも同じ週
    expect(calendarStart("2026-11-08")).toBe("2025-11-03"); // 日曜(週の最後)でも同じ週
    expect(calendarStart("2026-11-09")).toBe("2025-11-10"); // 次の月曜で 1 週ずれる
  });
});

describe("buildCalendar", () => {
  const today = "2026-11-05"; // 木
  const empty = new Map();

  it("53 週 × 7 日。今日より後で、記録の無い日(今週の金〜日)は null", () => {
    const { weeks } = buildCalendar(today, empty);
    expect(weeks).toHaveLength(CALENDAR_WEEKS);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]?.date).toBe("2025-11-03"); // 最初のマスは最初の月曜
    const last = weeks[CALENDAR_WEEKS - 1];
    expect(last.map((cell) => cell?.date ?? null)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", null, null, null]);
  });

  it("今日のマスだけ isToday", () => {
    const cells = buildCalendar(today, empty).weeks.flat().flatMap((cell) => (cell?.isToday ? [cell.date] : []));
    expect(cells).toEqual([today]);
  });

  it("濃さは記録した種類の数(0〜5)。種類は決まった順に並べる", () => {
    const kinds = new Map([
      ["2026-11-03", ["meal", "morning"] as const],
      ["2026-11-04", [...RECORD_KINDS].reverse()],
    ]);
    const cells = buildCalendar(today, kinds).weeks.flat();
    const at = (date: string) => cells.find((cell) => cell?.date === date);
    expect(at("2026-11-03")).toMatchObject({ level: 2, kinds: ["morning", "meal"] });
    expect(at("2026-11-04")).toMatchObject({ level: MAX_LEVEL, kinds: [...RECORD_KINDS] });
    expect(at("2026-11-02")).toMatchObject({ level: 0, kinds: [] }); // 過ぎた日で記録なし: マスは出す(灰色)
  });

  it("サーバーの明日(今日より後)に記録があれば、そのマスも出す", () => {
    const cells = buildCalendar(today, new Map([["2026-11-06", ["morning"] as const]])).weeks.flat();
    expect(cells.find((cell) => cell?.date === "2026-11-06")).toMatchObject({ level: 1 });
    expect(cells.some((cell) => cell?.date === "2026-11-07")).toBe(false); // 記録の無い、今日より後のマスは出さない
  });

  it("記録のある日の数は、期間の中の分だけ数える", () => {
    const kinds = new Map([
      ["2026-11-03", ["meal"] as const],
      ["2026-11-05", ["meal"] as const],
      ["2025-11-02", ["meal"] as const], // 期間より前(最初の月曜の前日)
    ]);
    expect(buildCalendar(today, kinds).recordedDays).toBe(2);
  });

  it("狭い画面で見せる直近 13 週の分は、別に数える(末尾から 13 週の最初の日から)", () => {
    const firstRecent = calendarStart(today); // 52 週前の月曜
    expect(RECENT_WEEKS).toBe(13);
    const kinds = new Map([
      ["2026-08-09", ["meal"] as const], // 直近 13 週の 1 日前(古い週の最後の日曜)
      ["2026-08-10", ["meal"] as const], // 直近 13 週の最初の月曜
      ["2026-11-05", ["meal"] as const],
    ]);
    const calendar = buildCalendar(today, kinds);
    expect(firstRecent).toBe("2025-11-03");
    expect(calendar.recordedDays).toBe(3);
    expect(calendar.recentRecordedDays).toBe(2);
    expect(calendar.weeks[CALENDAR_WEEKS - RECENT_WEEKS][0]?.date).toBe("2026-08-10");
  });

  it("月のラベル: 月が変わる週だけ。最初の週の次がすぐ別の月になるときは、重なるので最初を省く", () => {
    const { monthLabels } = buildCalendar(today, empty);
    expect(monthLabels).toHaveLength(CALENDAR_WEEKS);
    expect(monthLabels[0]).toBe("11月"); // 2025-11-03 の週。次の週(11-10)も 11 月
    expect(monthLabels.filter((label) => label !== null)).toEqual(["11月", "12月", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月"]);
  });

  it("最初の月曜が月末の週なら、次の週のラベルと重ならないように最初のラベルを付けない", () => {
    // 最初の月曜が 2025-11-24、次の月曜は 12-01(別の月)になる今日: 2025-11-24 + 364 日 = 2026-11-23 の週 → today = 2026-11-23
    const { monthLabels } = buildCalendar("2026-11-23", empty);
    expect(monthLabels[0]).toBeNull();
    expect(monthLabels[1]).toBe("12月");
  });
});
