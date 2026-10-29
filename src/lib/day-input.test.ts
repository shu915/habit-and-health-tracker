import { describe, expect, it } from "vitest";
import { parseDayInput } from "./day-input";

describe("parseDayInput", () => {
  it("キーが無い項目は結果に含めない(保存しても変更されない)", () => {
    expect(parseDayInput({})).toEqual({ ok: true, value: {} });
    expect(parseDayInput({ morningWeightKg: 60 })).toEqual({ ok: true, value: { morningWeightKg: "60.00" } });
    expect(parseDayInput({ reflection: "ok" })).toEqual({ ok: true, value: { reflection: "ok" } });
  });

  it("キーがあって空なら null(その項目を空にする)", () => {
    expect(parseDayInput({ morningWeightKg: null, reflection: null })).toEqual({
      ok: true,
      value: { morningWeightKg: null, reflection: null },
    });
    expect(parseDayInput({ morningWeightKg: "", reflection: "" })).toEqual({
      ok: true,
      value: { morningWeightKg: null, reflection: null },
    });
  });

  it("空白だけは未入力(null)で、前後の空白は取る", () => {
    expect(parseDayInput({ reflection: "  ", morningWeightKg: "  " })).toEqual({
      ok: true,
      value: { morningWeightKg: null, reflection: null },
    });
    expect(parseDayInput({ reflection: " 良い天気 " })).toEqual({ ok: true, value: { reflection: "良い天気" } });
  });

  it("体重は小数 2 桁の文字列にそろえる", () => {
    expect(parseDayInput({ morningWeightKg: "70" })).toEqual({ ok: true, value: { morningWeightKg: "70.00" } });
    expect(parseDayInput({ morningWeightKg: 62.5 })).toEqual({ ok: true, value: { morningWeightKg: "62.50" } });
  });

  it("体重が範囲外・数値でないときは拒否する", () => {
    for (const morningWeightKg of [0, -1, 500, 1000, "abc", Number.NaN, Number.POSITIVE_INFINITY, true, {}, []]) {
      expect(parseDayInput({ morningWeightKg }).ok).toBe(false);
    }
  });

  it("10 進数以外の表記(16 進・指数・2 進)の体重を拒否する", () => {
    for (const morningWeightKg of ["0x10", "1e2", "0b11", "-5", "+5", "6 0", "5.", ".5"]) {
      expect(parseDayInput({ morningWeightKg }).ok).toBe(false);
    }
    expect(parseDayInput({ morningWeightKg: " 62.5 " }).ok).toBe(true);
  });

  it("丸めたあとに範囲外になる体重を拒否する(DB の制約で落ちる前に)", () => {
    expect(parseDayInput({ morningWeightKg: 499.996 }).ok).toBe(false); // "500.00"
    expect(parseDayInput({ morningWeightKg: 0.001 }).ok).toBe(false); // "0.00"
    expect(parseDayInput({ morningWeightKg: 499.994 }).ok).toBe(true); // "499.99"
    expect(parseDayInput({ morningWeightKg: 0.01 }).ok).toBe(true); // "0.01"
  });

  it("長すぎる振り返りを拒否する", () => {
    expect(parseDayInput({ reflection: "あ".repeat(2000) }).ok).toBe(true);
    expect(parseDayInput({ reflection: "あ".repeat(2001) }).ok).toBe(false);
  });

  it("NUL 文字を含む文字列を拒否する(PostgreSQL の text に入らない)", () => {
    expect(parseDayInput({ reflection: "a\u0000b" }).ok).toBe(false);
  });

  it("文字列でない値や、オブジェクトでない入力を拒否する", () => {
    expect(parseDayInput({ reflection: 123 }).ok).toBe(false);
    expect(parseDayInput(null).ok).toBe(false);
    expect(parseDayInput("x").ok).toBe(false);
    expect(parseDayInput([]).ok).toBe(false);
  });

  it("余計なキー(user_id など)は無視し、結果に含めない", () => {
    const result = parseDayInput({ userId: "other", user_id: "other", id: 5, morningWeightKg: 60, reflection: "a" });
    expect(result.ok && Object.keys(result.value).sort()).toEqual(["morningWeightKg", "reflection"]);
  });
});
