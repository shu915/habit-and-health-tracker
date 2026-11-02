import { describe, expect, it } from "vitest";
import { defaultMealDayAndTime, mealLabel } from "./meal-time";

describe("mealLabel", () => {
  it.each([
    ["04:00", "朝食"],
    ["07:30", "朝食"],
    ["10:59", "朝食"],
    ["11:00", "昼食"],
    ["12:15", "昼食"],
    ["13:30", "昼食"],
    ["13:59", "昼食"],
    ["14:00", "間食"],
    ["15:30", "間食"],
    ["16:59", "間食"],
    ["17:00", "夕食"],
    ["19:30", "夕食"],
    ["21:59", "夕食"],
    ["22:00", "夜食"],
    ["23:59", "夜食"],
    ["24:00", "夜食"],
    ["25:30", "夜食"],
    ["26:59", "夜食"],
    ["00:00", "間食"],
    ["03:59", "間食"],
  ])("%s は %s", (time, label) => {
    expect(mealLabel(time)).toBe(label);
  });

  it.each(["27:00", "3:15", "03:5", "abc", "", "26:60", "99:99", "11:30:00"])("形が違う・範囲外の %s は null", (time) => {
    expect(mealLabel(time)).toBeNull();
  });
});

describe("defaultMealDayAndTime", () => {
  // ローカル時間で作る(new Date(年, 月 - 1, 日, 時, 分))
  const at = (month: number, day: number, hour: number, minute: number) => new Date(2026, month - 1, day, hour, minute);

  it("日中は、その日の今の時刻", () => {
    expect(defaultMealDayAndTime(at(10, 30, 12, 5))).toEqual({ date: "2026-10-30", time: "12:05" });
  });

  it("03:00 ちょうどは、その日", () => {
    expect(defaultMealDayAndTime(at(10, 30, 3, 0))).toEqual({ date: "2026-10-30", time: "03:00" });
  });

  it("02:59 は、前の日の食事(日付を前日にして、時刻は 24 を足す)", () => {
    expect(defaultMealDayAndTime(at(10, 30, 2, 59))).toEqual({ date: "2026-10-29", time: "26:59" });
  });

  it("0 時台は、前日の 24 時台", () => {
    expect(defaultMealDayAndTime(at(10, 30, 0, 10))).toEqual({ date: "2026-10-29", time: "24:10" });
    expect(defaultMealDayAndTime(at(10, 30, 1, 30))).toEqual({ date: "2026-10-29", time: "25:30" });
  });

  it("月初・年初の 0 時台は、前の月・前の年にさかのぼる", () => {
    expect(defaultMealDayAndTime(at(11, 1, 1, 0))).toEqual({ date: "2026-10-31", time: "25:00" });
    expect(defaultMealDayAndTime(new Date(2027, 0, 1, 0, 30))).toEqual({ date: "2026-12-31", time: "24:30" });
  });

  it("初期値の時刻は、必ずラベルが付く(形が正しい)", () => {
    for (const hour of [0, 2, 3, 11, 23]) {
      const { time } = defaultMealDayAndTime(at(10, 30, hour, 0));
      expect(mealLabel(time), time).not.toBeNull();
    }
  });
});
