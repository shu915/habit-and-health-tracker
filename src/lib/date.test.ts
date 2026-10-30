import { describe, expect, it } from "vitest";
import { isRecordableDate, isValidDateString, shiftDate, todayString } from "./date";

describe("isValidDateString", () => {
  it("実在する日付を受け付ける", () => {
    expect(isValidDateString("2026-10-21")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true); // うるう年
  });

  it("実在しない日付を拒否する", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2027-02-29")).toBe(false); // うるう年ではない
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
  });

  it("YYYY-MM-DD 以外の形を拒否する", () => {
    expect(isValidDateString("abc")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("2026-1-5")).toBe(false);
    expect(isValidDateString("2026-10-21T00:00:00Z")).toBe(false);
    expect(isValidDateString(" 2026-10-21")).toBe(false);
  });

  it("1900〜2100 年の外を拒否する(PostgreSQL が受け付けない 0000 年を含む)", () => {
    expect(isValidDateString("0000-01-01")).toBe(false);
    expect(isValidDateString("1899-12-31")).toBe(false);
    expect(isValidDateString("1900-01-01")).toBe(true);
    expect(isValidDateString("2100-12-31")).toBe(true);
    expect(isValidDateString("2101-01-01")).toBe(false);
  });
});

describe("todayString", () => {
  it("ローカル時間の日付を、YYYY-MM-DD で返す(ゼロ埋め)", () => {
    expect(todayString(new Date(2026, 0, 5, 9, 30))).toBe("2026-01-05");
    expect(todayString(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("日本の朝(UTC では前日)でも、ローカルの日付になる", () => {
    // ローカル時間で 2026-10-30 00:30 は、UTC に直すと前日になりうる。toISOString を使うと日付がずれる
    expect(todayString(new Date(2026, 9, 30, 0, 30))).toBe("2026-10-30");
  });

  it("返す形は isValidDateString を通る", () => {
    expect(isValidDateString(todayString())).toBe(true);
  });
});

describe("isRecordableDate", () => {
  const now = new Date(2026, 9, 30, 9, 0); // ローカル時間の 2026-10-30

  it("今日までと過去は記録できる", () => {
    for (const date of ["2026-10-30", "2026-10-01", "2025-01-01", "1900-01-01"]) expect(isRecordableDate(date, now), date).toBe(true);
  });

  it("翌日までは許す(サーバーと利用者のタイムゾーンのずれ)が、それより先は記録できない", () => {
    expect(isRecordableDate("2026-10-31", now)).toBe(true);
    expect(isRecordableDate("2026-11-01", now)).toBe(false);
    expect(isRecordableDate("2100-12-31", now)).toBe(false);
  });

  it("月末・年末をまたぐ翌日を正しく扱う", () => {
    const lastDay = new Date(2026, 11, 31, 23, 0);
    expect(isRecordableDate("2027-01-01", lastDay)).toBe(true);
    expect(isRecordableDate("2027-01-02", lastDay)).toBe(false);
  });

  it("実在しない日付・形が違う値は記録できない", () => {
    for (const date of ["2026-02-30", "abc", "", "0000-01-01"]) expect(isRecordableDate(date, now), date).toBe(false);
  });
});

describe("shiftDate", () => {
  it("前日・翌日を返す", () => {
    expect(shiftDate("2026-10-30", -1)).toBe("2026-10-29");
    expect(shiftDate("2026-10-30", 1)).toBe("2026-10-31");
  });

  it("月・年・うるう日をまたぐ", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDate("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("0 日なら同じ日。結果は isValidDateString を通る", () => {
    expect(shiftDate("2026-10-30", 0)).toBe("2026-10-30");
    expect(isValidDateString(shiftDate("2026-02-28", 1))).toBe(true);
  });
});
