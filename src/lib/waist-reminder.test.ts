import { describe, expect, it } from "vitest";
import { isWaistDue, WAIST_REMIND_DAYS } from "./waist-reminder";

describe("isWaistDue", () => {
  it("月末の 3 日間で、今月まだ保存していなければ true(31 日の月: 29・30・31 日)", () => {
    expect(WAIST_REMIND_DAYS).toBe(3);
    expect(isWaistDue("2026-10-28", null)).toBe(false);
    for (const day of ["29", "30", "31"]) expect(isWaistDue(`2026-10-${day}`, "2026-09-30"), day).toBe(true);
  });

  it("月の長さに合わせる: 30 日の月は 28〜30 日、平年の 2 月は 26〜28 日、うるう年の 2 月は 27〜29 日", () => {
    expect(isWaistDue("2026-11-27", null)).toBe(false);
    for (const day of ["28", "29", "30"]) expect(isWaistDue(`2026-11-${day}`, null), day).toBe(true);

    expect(isWaistDue("2027-02-25", null)).toBe(false);
    for (const day of ["26", "27", "28"]) expect(isWaistDue(`2027-02-${day}`, null), day).toBe(true);

    expect(isWaistDue("2028-02-26", null)).toBe(false);
    for (const day of ["27", "28", "29"]) expect(isWaistDue(`2028-02-${day}`, null), day).toBe(true);
  });

  it("月末でなければ、保存したことが無くても false", () => {
    for (const today of ["2026-10-01", "2026-10-15", "2026-10-28"]) expect(isWaistDue(today, null), today).toBe(false);
  });

  it("今月すでに保存していれば、月末でも false(月の初めでも末でも、今月の日付ならよい)", () => {
    expect(isWaistDue("2026-10-30", "2026-10-30")).toBe(false);
    expect(isWaistDue("2026-10-30", "2026-10-02")).toBe(false);
    expect(isWaistDue("2026-10-31", "2026-10-29")).toBe(false);
  });

  it("前の月以前に保存したきり、または一度も保存していなければ true。同じ月でも別の年は今月ではない", () => {
    expect(isWaistDue("2026-10-30", "2026-09-30")).toBe(true);
    expect(isWaistDue("2026-10-30", "2025-10-30")).toBe(true);
    expect(isWaistDue("2026-10-30", null)).toBe(true);
  });

  it("形が違う today は false(催促を出さない側に倒す)", () => {
    for (const today of ["", "2026-10", "abc", "2026/10/30"]) expect(isWaistDue(today, null), today).toBe(false);
  });
});
