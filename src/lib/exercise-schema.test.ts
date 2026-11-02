import { describe, expect, it } from "vitest";
import { EXERCISE_LIMITS, EXERCISE_MEMO_MAX_LENGTH, formatExerciseRange, isExerciseId } from "./exercise-limits";
import { EXERCISE_FIELDS, parseExerciseForm } from "./exercise-schema";

const valid = { type: "walk", intensity: "normal", minutes: "30", memo: "" };

describe("parseExerciseForm", () => {
  it("正しい入力は、数値の分と、空メモの null に直して返す", () => {
    expect(parseExerciseForm(valid)).toEqual({ ok: true, values: { type: "walk", intensity: "normal", minutes: 30, memo: null } });
  });

  it("メモは前後の空白を取り、空白だけなら null。ちょうど上限の長さは通る", () => {
    expect(parseExerciseForm({ ...valid, memo: "  脚の日 " })).toMatchObject({ ok: true, values: { memo: "脚の日" } });
    expect(parseExerciseForm({ ...valid, memo: "   " })).toMatchObject({ ok: true, values: { memo: null } });
    expect(parseExerciseForm({ ...valid, memo: "あ".repeat(EXERCISE_MEMO_MAX_LENGTH) }).ok).toBe(true);
    expect(parseExerciseForm({ ...valid, memo: "あ".repeat(EXERCISE_MEMO_MAX_LENGTH + 1) }).ok).toBe(false);
  });

  it("時間は app の範囲の端が通り、直外は拒否される", () => {
    const { min, max } = EXERCISE_LIMITS.minutes.app;
    expect(parseExerciseForm({ ...valid, minutes: String(min) }).ok).toBe(true);
    expect(parseExerciseForm({ ...valid, minutes: String(max) }).ok).toBe(true);
    expect(parseExerciseForm({ ...valid, minutes: String(min - 1) }).ok).toBe(false);
    expect(parseExerciseForm({ ...valid, minutes: String(max + 1) }).ok).toBe(false);
  });

  it("app の範囲は db の範囲の内側にある", () => {
    const { app, db } = EXERCISE_LIMITS.minutes;
    expect(app.min).toBeGreaterThanOrEqual(db.min);
    expect(app.max).toBeLessThanOrEqual(db.max);
  });

  it.each(["", " ", "1.5", "1e2", "0x10", "-5", "abc", "３０"])("時間が %j なら拒否する", (minutes) => {
    const result = parseExerciseForm({ ...valid, minutes });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.minutes).toContain("時間(分)");
  });

  it.each([
    ["type", ""],
    ["type", "swim"],
    ["intensity", ""],
    ["intensity", "HARD"],
  ] as const)("%s が %j なら、その欄のエラーにする", (field, value) => {
    const result = parseExerciseForm({ ...valid, [field]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
  });

  it("必須の欄のキーが無ければ、その欄のエラーにする(日の記録と違い、省略は許さない)", () => {
    const result = parseExerciseForm({ memo: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["intensity", "minutes", "type"]);
  });

  it("欄ごとに最初のエラーだけを返し、複数の欄のエラーが同時に出る", () => {
    const result = parseExerciseForm({ type: "x", intensity: "y", minutes: "0", memo: "" });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["intensity", "minutes", "type"]);
  });

  it("定義された欄以外のキーは無視する(user_id などを紛れ込ませても結果に入らない)", () => {
    const result = parseExerciseForm({ ...valid, userId: "x", user_id: "x", dayId: "1" });
    expect(result).toEqual({ ok: true, values: { type: "walk", intensity: "normal", minutes: 30, memo: null } });
  });

  it("欄は 種類・強さ・時間・メモ", () => {
    expect([...EXERCISE_FIELDS].sort()).toEqual(["intensity", "memo", "minutes", "type"]);
  });
});

describe("exercise-limits", () => {
  it("isExerciseId: 1〜int4 の最大値の整数だけ", () => {
    for (const id of [1, 42, 2_147_483_647]) expect(isExerciseId(id)).toBe(true);
    for (const id of [0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY]) expect(isExerciseId(id)).toBe(false);
  });

  it("フォームに出す範囲は app の範囲", () => {
    expect(formatExerciseRange("minutes")).toBe("1〜600");
  });
});
