import { describe, expect, it } from "vitest";
import { durationParts, timeParts } from "./pair-input";

describe("timeParts", () => {
  it("正しい HH:MM は、先頭の 0 を取って 2 つの欄にする", () => {
    expect(timeParts("03:15")).toEqual({ first: "3", second: "15" });
    expect(timeParts("23:00")).toEqual({ first: "23", second: "0" });
  });

  it("空は空欄", () => {
    expect(timeParts("")).toEqual({ first: "", second: "" });
  });

  it("検証に失敗した入力(不正な形)も、入力した文字を欄に戻す", () => {
    expect(timeParts("25:70")).toEqual({ first: "25", second: "70" });
    expect(timeParts("ab:5")).toEqual({ first: "ab", second: "5" });
  });
});

describe("durationParts", () => {
  it("分(文字列)を、時間と分にする", () => {
    expect(durationParts("450")).toEqual({ first: "7", second: "30" });
    expect(durationParts("45")).toEqual({ first: "0", second: "45" });
  });

  it("空は空欄", () => {
    expect(durationParts("")).toEqual({ first: "", second: "" });
  });

  it("検証に失敗した入力(数字でない)も、入力した文字を欄に戻す", () => {
    expect(durationParts("x:30")).toEqual({ first: "x", second: "30" });
  });
});
