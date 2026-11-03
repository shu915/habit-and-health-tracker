import { describe, expect, it } from "vitest";
import { sleepMidpoint, sleepMinutes } from "./sleep";

describe("sleepMinutes", () => {
  it("日をまたぐ睡眠: 23:30 → 06:30 は 7 時間", () => {
    expect(sleepMinutes("23:30", "06:30")).toBe(420);
  });

  it("日をまたがない睡眠: 01:30 → 08:00 は 6 時間 30 分", () => {
    expect(sleepMinutes("01:30", "08:00")).toBe(390);
  });

  it("0 時ちょうどをまたぐ: 23:59 → 00:01 は 2 分", () => {
    expect(sleepMinutes("23:59", "00:01")).toBe(2);
  });

  it("最長に近い値: 00:01 → 00:00 は 23 時間 59 分", () => {
    expect(sleepMinutes("00:01", "00:00")).toBe(23 * 60 + 59);
  });

  it("どちらかが空なら null", () => {
    expect(sleepMinutes(null, "06:30")).toBeNull();
    expect(sleepMinutes("23:30", null)).toBeNull();
    expect(sleepMinutes(null, null)).toBeNull();
  });

  it("同じ時刻は決められないので null", () => {
    expect(sleepMinutes("07:00", "07:00")).toBeNull();
  });

  it("読めない値は null", () => {
    expect(sleepMinutes("24:00", "06:30")).toBeNull();
    expect(sleepMinutes("23:30", "6:30")).toBeNull();
  });
});

describe("sleepMidpoint", () => {
  it("就寝と起床の真ん中の時刻を返す(日をまたぐ場合も)", () => {
    expect(sleepMidpoint("23:30", "06:30")).toBe("03:00");
    expect(sleepMidpoint("22:00", "06:00")).toBe("02:00");
    expect(sleepMidpoint("01:00", "09:00")).toBe("05:00"); // 日をまたがない
  });

  it("0 時をまたいだ結果が 24 時以降にならない", () => {
    expect(sleepMidpoint("20:00", "06:00")).toBe("01:00");
    expect(sleepMidpoint("23:00", "05:00")).toBe("02:00");
    expect(sleepMidpoint("18:00", "04:00")).toBe("23:00");
  });

  it("半端な分は四捨五入する", () => {
    expect(sleepMidpoint("23:00", "05:01")).toBe("02:01"); // 361 分の半分 = 180.5 → 181 分後
  });

  it("睡眠時間が出せないとき(空・読めない・同じ時刻)は null", () => {
    expect(sleepMidpoint(null, "06:00")).toBeNull();
    expect(sleepMidpoint("23:00", null)).toBeNull();
    expect(sleepMidpoint("abc", "06:00")).toBeNull();
    expect(sleepMidpoint("06:00", "06:00")).toBeNull();
  });
});
