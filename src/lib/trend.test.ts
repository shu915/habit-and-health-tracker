import { describe, expect, it } from "vitest";
import { buildTrend, latestAverage, latestRecorded, parseTrendRange, trendDates, trendEnd, valuesByDate } from "./trend";

describe("parseTrendRange", () => {
  it("7・28・90 はそのまま。読めない値・一覧に無い値・配列・未指定は 28", () => {
    expect(parseTrendRange("7")).toBe(7);
    expect(parseTrendRange("28")).toBe(28);
    expect(parseTrendRange("90")).toBe(90);
    for (const raw of ["30", "0", "-7", "abc", "", "28.0", ["7", "28"], undefined]) expect(parseTrendRange(raw), String(raw)).toBe(28);
  });
});

describe("trendDates", () => {
  it("end を含む days 日分を、古い順に並べる(月またぎ・うるう日も)", () => {
    expect(trendDates("2028-03-02", 4)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02"]);
  });
  it("28 日は 4 週ぶん", () => {
    const dates = trendDates("2026-11-04", 28);
    expect(dates).toHaveLength(28);
    expect(dates[0]).toBe("2026-10-08");
    expect(dates[27]).toBe("2026-11-04");
  });
});

describe("valuesByDate", () => {
  it("null の日は入れず、文字列を数値にする", () => {
    const map = valuesByDate([
      { date: "2026-11-01", value: "98.50" },
      { date: "2026-11-02", value: null },
    ]);
    expect([...map]).toEqual([["2026-11-01", 98.5]]);
  });
});

describe("buildTrend", () => {
  const dates = trendDates("2026-11-10", 5); // 11-06 〜 11-10

  it("記録の無い日の値は null(0 にしない)。その日の値は、その日の記録そのまま", () => {
    const points = buildTrend(dates, new Map([["2026-11-08", 98]]), 2);
    expect(points.map((p) => p.value)).toEqual([null, null, 98, null, null]);
  });

  it("移動平均は、その日を含む過去 7 日の記録の平均(記録の無い日は数えない)", () => {
    const byDate = new Map([
      ["2026-11-06", 100],
      ["2026-11-08", 98],
      ["2026-11-10", 99],
    ]);
    const points = buildTrend(dates, byDate, 2);
    expect(points[0].average).toBeNull(); // 11-06: 記録 1 つだけ
    expect(points[2].average).toBe(99); // 11-08: (100 + 98) / 2
    expect(points[4].average).toBe(99); // 11-10: (100 + 98 + 99) / 3
  });

  it("期間より前の記録も、最初の日の平均に使う(窓は過去 7 日)", () => {
    const byDate = new Map([
      ["2026-11-01", 100], // 11-06 の窓(10-31〜11-06。その日を含む過去 7 日)に入る
      ["2026-11-06", 98],
    ]);
    expect(buildTrend(dates, byDate, 2)[0].average).toBe(99);
    // 11-07 の窓は 11-01〜11-07 なので、まだ 11-01 を含む。11-08 の窓(11-02〜)からは含まない
    expect(buildTrend(dates, byDate, 2)[1].average).toBe(99);
    expect(buildTrend(dates, byDate, 2)[2].average).toBeNull();
  });

  it("平均は指定の桁数に丸める", () => {
    const byDate = new Map([
      ["2026-11-09", 98.01],
      ["2026-11-10", 98.02],
      ["2026-11-08", 98.02],
    ]);
    expect(buildTrend(dates, byDate, 2)[4].average).toBe(98.02);
    expect(buildTrend(dates, new Map([["2026-11-09", 22.5], ["2026-11-10", 22.6]]), 1)[4].average).toBe(22.6); // 22.55 → 22.6
  });

  it("記録がまったく無ければ、値も平均もすべて null", () => {
    expect(buildTrend(dates, new Map(), 2).every((p) => p.value === null && p.average === null)).toBe(true);
  });
});

describe("trendEnd(期間の最後の日)", () => {
  it("今日までが基本。サーバーの明日に朝の記録がある日は、明日までにする(日数は変わらない)", () => {
    expect(trendEnd("2026-11-04", new Set())).toBe("2026-11-04");
    expect(trendEnd("2026-11-04", new Set(["2026-11-03", "2026-11-04"]))).toBe("2026-11-04");
    expect(trendEnd("2026-11-04", new Set(["2026-11-05"]))).toBe("2026-11-05");
    expect(trendDates(trendEnd("2026-11-04", new Set(["2026-11-05"])), 28)).toHaveLength(28);
  });
  it("月末・年末の明日も正しく数える", () => {
    expect(trendEnd("2026-12-31", new Set(["2027-01-01"]))).toBe("2027-01-01");
  });
});

describe("latestRecorded / latestAverage", () => {
  const points = buildTrend(trendDates("2026-11-10", 7), new Map([["2026-11-07", 98], ["2026-11-08", 99]]), 2);
  it("いちばん新しい記録の点と、いちばん新しい平均の点を返す", () => {
    expect(latestRecorded(points)?.date).toBe("2026-11-08");
    expect(latestAverage(points)?.date).toBe("2026-11-10"); // 平均は、記録の無い日にも続く(過去 7 日)
  });
  it("記録が無ければ undefined", () => {
    const none = buildTrend(trendDates("2026-11-10", 7), new Map(), 2);
    expect(latestRecorded(none)).toBeUndefined();
    expect(latestAverage(none)).toBeUndefined();
  });
});
