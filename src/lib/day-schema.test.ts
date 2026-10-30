import { describe, expect, it } from "vitest";
import { DAY_LIMITS, REFLECTION_MAX_LENGTH } from "./day-limits";
import { DAY_FIELDS, parseDayForm } from "./day-schema";

function expectOk(raw: Record<string, unknown>) {
  const result = parseDayForm(raw);
  if (!result.ok) throw new Error(`検証に失敗: ${JSON.stringify(result.errors)}`);
  return result.values;
}

function expectError(raw: Record<string, unknown>, field: string) {
  const result = parseDayForm(raw);
  expect(result.ok, JSON.stringify(raw)).toBe(false);
  if (!result.ok) expect(Object.keys(result.errors), JSON.stringify(raw)).toContain(field);
}

describe("parseDayForm", () => {
  it("キーが無い項目は結果に含めない(保存しても変更されない)", () => {
    expect(expectOk({})).toEqual({});
    expect(expectOk({ morningWeightKg: "60" })).toEqual({ morningWeightKg: "60.00" });
    expect(expectOk({ reflection: "ok" })).toEqual({ reflection: "ok" });
  });

  it("キーがあって空欄なら null(その項目を空にする)", () => {
    expect(expectOk({ morningWeightKg: "", morningBodyFatPercent: "", reflection: "" })).toEqual({
      morningWeightKg: null,
      morningBodyFatPercent: null,
      reflection: null,
    });
  });

  it("空白だけは未入力(null)で、前後の空白は取る", () => {
    expect(expectOk({ reflection: "  ", morningWeightKg: "  " })).toEqual({ reflection: null, morningWeightKg: null });
    expect(expectOk({ reflection: " 良い天気 " })).toEqual({ reflection: "良い天気" });
  });

  it("体重と体脂肪率は、列の桁数(2 桁・1 桁)に丸める", () => {
    expect(expectOk({ morningWeightKg: "70" }).morningWeightKg).toBe("70.00");
    expect(expectOk({ morningWeightKg: "98.345" }).morningWeightKg).toMatch(/^98\.3[45]$/);
    expect(expectOk({ morningBodyFatPercent: "32.46" }).morningBodyFatPercent).toBe("32.5");
  });

  it("範囲(day-limits.ts の app)の端は通り、直外は拒否する", () => {
    for (const field of ["morningWeightKg", "morningBodyFatPercent"] as const) {
      const { app, scale } = DAY_LIMITS[field];
      const step = 10 ** -scale;
      const text = (value: number) => value.toFixed(scale);
      for (const value of [app.min, app.max]) expect(parseDayForm({ [field]: text(value) }).ok, `${field}=${text(value)}`).toBe(true);
      expectError({ [field]: text(app.min - step) }, field);
      expectError({ [field]: text(app.max + step) }, field);
    }
  });

  it("範囲の判定は、丸めたあとの値で行う(DB の制約で落ちる前に)", () => {
    // 体重(小数 2 桁): 上限 300 の少し上でも、丸めて 300.00 になれば通り、300.01 になれば拒否
    expect(parseDayForm({ morningWeightKg: "300.004" }).ok).toBe(true);
    expectError({ morningWeightKg: "300.006" }, "morningWeightKg");
    // 下限 20 の少し下でも、丸めて 20.00 になれば通り、19.99 なら拒否
    expect(parseDayForm({ morningWeightKg: "19.996" }).ok).toBe(true);
    expectError({ morningWeightKg: "19.994" }, "morningWeightKg");
    // 体脂肪率(小数 1 桁)
    expect(parseDayForm({ morningBodyFatPercent: "60.04" }).ok).toBe(true);
    expectError({ morningBodyFatPercent: "60.06" }, "morningBodyFatPercent");
  });

  it("10 進数以外の表記(16 進・指数・符号付き・全角)を拒否する", () => {
    for (const value of ["0x10", "1e2", "0b11", "-5", "+5", "6 0", "5.", ".5", "６０"]) {
      expectError({ morningWeightKg: value }, "morningWeightKg");
      expectError({ morningBodyFatPercent: value }, "morningBodyFatPercent");
    }
  });

  it("文字列以外の値(数値・真偽値など)を拒否する", () => {
    expectError({ morningWeightKg: 60 }, "morningWeightKg");
    expectError({ reflection: 123 }, "reflection");
    expectError({ reflection: true }, "reflection");
  });

  it("振り返りは、上限の文字数までは通り、超えると拒否する", () => {
    expect(parseDayForm({ reflection: "あ".repeat(REFLECTION_MAX_LENGTH) }).ok).toBe(true);
    expectError({ reflection: "あ".repeat(REFLECTION_MAX_LENGTH + 1) }, "reflection");
  });

  it("振り返りの改行はそのまま残す(NUL 文字は拒否する)", () => {
    expect(expectOk({ reflection: "1 行目\n2 行目" }).reflection).toBe("1 行目\n2 行目");
    expectError({ reflection: "a\u0000b" }, "reflection");
  });

  it("複数の欄が誤りなら、欄ごとにエラーを返す", () => {
    const result = parseDayForm({ morningWeightKg: "abc", morningBodyFatPercent: "200" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["morningBodyFatPercent", "morningWeightKg"]);
  });

  it("余計なキー(user_id など)は無視し、結果に含めない", () => {
    const values = expectOk({ userId: "other", user_id: "other", id: "5", date: "2000-01-01", reflection: "a" });
    expect(Object.keys(values)).toEqual(["reflection"]);
    expect(DAY_FIELDS).toEqual(["morningWeightKg", "morningBodyFatPercent", "reflection"]);
  });
});
