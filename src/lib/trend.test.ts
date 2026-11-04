import { describe, expect, it } from "vitest";
import { buildSleepTrend, buildTrend, latestAverage, latestRecorded, median, nightClock, nightOffset, nightTimeOfDay, parseTrendRange, sleepAxis, sleepMedians, trendDates, trendEnd, valuesByDate, type SleepPoint } from "./trend";

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

describe("nightOffset / nightClock(睡眠の縦軸。18:00 を 0 とした分)", () => {
  it("18:00 が 0、24:00 が 360、翌朝 8:00 が 840。18:00 より前は翌日側", () => {
    expect(nightOffset("18:00")).toBe(0);
    expect(nightOffset("23:30")).toBe(330);
    expect(nightOffset("00:00")).toBe(360);
    expect(nightOffset("02:30")).toBe(510);
    expect(nightOffset("08:20")).toBe(860);
    expect(nightOffset("17:59")).toBe(1439);
  });
  it("読めない時刻は null", () => {
    expect(nightOffset("25:00")).toBeNull();
    expect(nightOffset("abc")).toBeNull();
  });
  it("軸の分を、時刻の表示に戻す(24 時間を超えたら翌日の時刻、負は前の時刻)", () => {
    expect(nightClock(0)).toBe("18:00");
    expect(nightClock(330)).toBe("23:30");
    expect(nightClock(360)).toBe("0:00");
    expect(nightClock(840)).toBe("8:00");
    expect(nightClock(-60)).toBe("17:00");
    expect(nightClock(1440)).toBe("18:00");
    expect(nightClock(555.5)).toBe("3:16"); // 小数は、入口で分に丸める
    expect(nightClock(554.4)).toBe("3:14");
  });
});

describe("buildSleepTrend", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];
  it("就寝(前の夜)から起床までの帯と、中間時刻・睡眠時間を、起きた日の列に置く", () => {
    const points = buildSleepTrend(dates, new Map([["2026-11-03", { bedtime: "23:30", wakeTime: "06:30" }]]));
    expect(points[1]).toEqual({ date: "2026-11-03", range: [330, 750], midpoint: 540, minutes: 420, bedtime: "23:30", wakeTime: "06:30" });
  });
  it("深夜に寝た日(02:30 → 08:20)も、帯がつながる", () => {
    const [point] = buildSleepTrend(["2026-11-04"], new Map([["2026-11-04", { bedtime: "02:30", wakeTime: "08:20" }]]));
    expect(point.range).toEqual([510, 860]);
    expect(point.minutes).toBe(350);
  });
  it("記録の無い日・片方だけの日・同じ時刻の日は、帯も中間時刻も null(0 にしない)", () => {
    const points = buildSleepTrend(dates, new Map([["2026-11-03", { bedtime: "23:30", wakeTime: null }], ["2026-11-04", { bedtime: "07:00", wakeTime: "07:00" }]]));
    for (const point of points) expect([point.range, point.midpoint, point.minutes]).toEqual([null, null, null]);
    expect(points[1].bedtime).toBe("23:30"); // 入力された時刻は残す(表で見せるため)
  });
});

describe("sleepAxis", () => {
  const point = (start: number, end: number): SleepPoint => ({ date: "d", range: [start, end], midpoint: (start + end) / 2, minutes: end - start, bedtime: null, wakeTime: null });
  it("帯が全部入るように 1 時間単位に広げ、目盛りは整数の分で並べる", () => {
    const axis = sleepAxis([point(330, 750)]); // 23:30〜06:30
    expect(axis.domain[0]).toBeLessThanOrEqual(330 - 30);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(750 + 30);
    expect(axis.ticks[0]).toBe(axis.domain[0]);
    expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.domain[1]);
    expect(axis.ticks.every((t) => t % 60 === 0)).toBe(true);
  });
  it("幅が 8 時間を超えれば 2 時間おき、以下なら 1 時間おき。最小でも 4 時間", () => {
    const wide = sleepAxis([point(300, 900)]);
    expect(wide.ticks[1] - wide.ticks[0]).toBe(120);
    const narrow = sleepAxis([point(360, 420)]);
    expect(narrow.domain[1] - narrow.domain[0]).toBeGreaterThanOrEqual(240);
    expect(narrow.ticks[1] - narrow.ticks[0]).toBe(60);
  });
  it("記録が無ければ、既定の範囲", () => {
    expect(sleepAxis([]).domain).toEqual([0, 720]);
  });
});

describe("median", () => {
  it("奇数個は真ん中、偶数個は真ん中の 2 つの平均。並べ替えてから数える", () => {
    expect(median([300, 480, 420])).toBe(420);
    expect(median([300, 480, 420, 360])).toBe(390);
    expect(median([7])).toBe(7);
  });
  it("値が無ければ null。元の配列は並べ替えない", () => {
    expect(median([])).toBeNull();
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("nightTimeOfDay", () => {
  it("軸の分を、2 桁の時刻(HH:MM)にする。24 時間を超えたら翌日の時刻、負は前の時刻", () => {
    expect(nightTimeOfDay(330)).toBe("23:30");
    expect(nightTimeOfDay(555)).toBe("03:15");
    expect(nightTimeOfDay(360)).toBe("00:00");
    expect(nightTimeOfDay(-60)).toBe("17:00");
    expect(nightTimeOfDay(554.6)).toBe("03:15"); // 分に丸める
  });
});

describe("sleepMedians(睡眠のカードの数字。すべて中央値)", () => {
  const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  const bySleep = (rows: Record<string, [string, string]>) => buildSleepTrend(dates, new Map(Object.entries(rows).map(([date, [bedtime, wakeTime]]) => [date, { bedtime, wakeTime }])));

  it("睡眠時間・就寝・起床・中間時刻の中央値を出す。時刻は日をまたいでも壊れない(23:30 と 00:30 の中央値は、昼にならない)", () => {
    const points = bySleep({
      "2026-11-01": ["23:30", "06:30"],
      "2026-11-02": ["00:30", "07:30"],
      "2026-11-03": ["01:30", "08:30"],
    });
    const result = sleepMedians(points);
    expect(result.bedtime).toBe("00:30"); // 23:30 / 00:30 / 01:30 の真ん中
    expect(result.wakeTime).toBe("07:30");
    expect(result.minutes).toBe(420);
    expect(result.midpoint).toBe("04:00"); // 日ごとの中間 03:00 / 04:00 / 05:00 の真ん中
  });

  it("極端な日が 1 日混ざっても、ふだんの値に近い(平均のように引きずられない)", () => {
    const points = bySleep({
      "2026-11-01": ["23:00", "06:00"],
      "2026-11-02": ["23:10", "06:10"],
      "2026-11-03": ["22:50", "05:50"],
      "2026-11-04": ["23:00", "06:00"],
      "2026-11-05": ["04:00", "06:00"], // 徹夜ぎみ(2 時間)
    });
    expect(sleepMedians(points).minutes).toBe(420);
    expect(sleepMedians(points).bedtime).toBe("23:00");
  });

  it("帯が出せない日(片方だけ・空)は数えない。記録が無ければ、すべて null", () => {
    const points = buildSleepTrend(dates, new Map([["2026-11-01", { bedtime: "23:30", wakeTime: null }]]));
    expect(sleepMedians(points)).toEqual({ minutes: null, bedtime: null, wakeTime: null, midpoint: null });
  });
});
