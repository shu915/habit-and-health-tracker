import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatTimeOfDay,
  joinMinutes,
  joinTimeOfDay,
  splitMinutes,
  splitTimeOfDay,
} from "./duration";

describe("splitMinutes", () => {
  it("分を、時間と分に分ける", () => {
    expect(splitMinutes(450)).toEqual({ hours: 7, minutes: 30 });
    expect(splitMinutes(480)).toEqual({ hours: 8, minutes: 0 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  });
});

describe("formatDuration", () => {
  it("「7時間30分」の形にする(0 の部分は省く)", () => {
    expect(formatDuration(450)).toBe("7時間30分");
    expect(formatDuration(480)).toBe("8時間");
    expect(formatDuration(45)).toBe("45分");
    expect(formatDuration(60)).toBe("1時間");
    expect(formatDuration(0)).toBe("0分");
  });

  it("未入力は null", () => {
    expect(formatDuration(null)).toBeNull();
  });
});

describe("joinMinutes", () => {
  it("時間と分を、分にする", () => {
    expect(joinMinutes("7", "30")).toBe("450");
    expect(joinMinutes("8", "0")).toBe("480");
    expect(joinMinutes("0", "45")).toBe("45");
    expect(joinMinutes(" 7 ", " 30 ")).toBe("450");
  });

  it("片方だけ空なら、空のほうを 0 として扱う", () => {
    expect(joinMinutes("7", "")).toBe("420");
    expect(joinMinutes("", "45")).toBe("45");
  });

  it("どちらも空なら未入力(空文字)", () => {
    expect(joinMinutes("", "")).toBe("");
    expect(joinMinutes("  ", "  ")).toBe("");
  });

  it("分が 60 以上でも、合計の分にする(範囲はサーバーが検証する)", () => {
    expect(joinMinutes("7", "90")).toBe("510");
  });

  it("数字でない入力は、サーバーが拒否できる文字列にする(数値に化けさせない)", () => {
    expect(joinMinutes("7.5", "")).toBe("7.5:");
    expect(joinMinutes("abc", "30")).toBe("abc:30");
    expect(joinMinutes("7", "-5")).toBe("7:-5");
    expect(joinMinutes("0x10", "0")).toBe("0x10:0");
  });

  it("往復しても同じ値に戻る(分 → 時間と分 → 分)", () => {
    for (const minutes of [0, 45, 60, 450, 480, 1080]) {
      const { hours, minutes: rest } = splitMinutes(minutes);
      expect(joinMinutes(String(hours), String(rest))).toBe(String(minutes));
    }
  });
});

describe("splitTimeOfDay / formatTimeOfDay", () => {
  it("\"03:15\" を、時と分に分ける。形が違えば null", () => {
    expect(splitTimeOfDay("03:15")).toEqual({ hours: 3, minutes: 15 });
    expect(splitTimeOfDay("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(splitTimeOfDay("23:59")).toEqual({ hours: 23, minutes: 59 });
    for (const bad of ["3:15", "24:00", "03:60", "03:5", "abc", ""]) expect(splitTimeOfDay(bad)).toBeNull();
  });

  it("「3時15分」の形にする(分が 0 なら「3時」)", () => {
    expect(formatTimeOfDay("03:15")).toBe("3時15分");
    expect(formatTimeOfDay("23:00")).toBe("23時");
    expect(formatTimeOfDay("00:05")).toBe("0時5分");
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay("xx")).toBe("xx"); // 形が違う値は、そのまま見せる(隠さない)
  });
});

describe("joinTimeOfDay", () => {
  it("時と分を、HH:MM にする", () => {
    expect(joinTimeOfDay("3", "15")).toBe("03:15");
    expect(joinTimeOfDay("23", "5")).toBe("23:05");
    expect(joinTimeOfDay(" 0 ", " 0 ")).toBe("00:00");
  });

  it("片方だけ空なら 0 として扱い、どちらも空なら未入力(空文字)", () => {
    expect(joinTimeOfDay("3", "")).toBe("03:00");
    expect(joinTimeOfDay("", "30")).toBe("00:30");
    expect(joinTimeOfDay("", "")).toBe("");
    expect(joinTimeOfDay("  ", "  ")).toBe("");
  });

  it("範囲外や数字でない入力は、サーバーが拒否できる形のまま返す(正しい時刻に化けさせない)", () => {
    expect(splitTimeOfDay(joinTimeOfDay("24", "0"))).toBeNull();
    expect(splitTimeOfDay(joinTimeOfDay("3", "60"))).toBeNull();
    expect(splitTimeOfDay(joinTimeOfDay("123", "15"))).toBeNull();
    expect(splitTimeOfDay(joinTimeOfDay("3.5", "0"))).toBeNull();
    expect(splitTimeOfDay(joinTimeOfDay("abc", "15"))).toBeNull();
    expect(splitTimeOfDay(joinTimeOfDay("-1", "0"))).toBeNull();
  });

  it("往復しても同じ値に戻る", () => {
    for (const value of ["00:00", "03:15", "12:30", "23:59"]) {
      const parts = splitTimeOfDay(value);
      expect(parts && joinTimeOfDay(String(parts.hours), String(parts.minutes))).toBe(value);
    }
  });
});
