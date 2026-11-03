import { describe, expect, it } from "vitest";
import { exerciseTimeLabel } from "./exercise-time";

describe("exerciseTimeLabel", () => {
  it.each([
    ["03:00", "午前"],
    ["06:30", "午前"],
    ["11:59", "午前"],
    ["12:00", "午後"],
    ["17:59", "午後"],
    ["18:00", "夜"],
    ["23:59", "夜"],
    ["24:00", "夜"], // 翌日の深夜(前の日の運動として入れる)
    ["26:59", "夜"],
    ["00:00", "夜"],
    ["02:59", "夜"],
  ])("%s は %s", (time, label) => {
    expect(exerciseTimeLabel(time)).toBe(label);
  });

  it.each([null, "", "abc", "27:00", "3:15", "12:60", "11:30:00"])("時刻なし・形が違う・範囲外の %s は null", (time) => {
    expect(exerciseTimeLabel(time)).toBeNull();
  });
});
