import { describe, expect, it } from "vitest";
import { PROFILE_LIMITS } from "./profile-limits";
import { parseProfileForm, PROFILE_FIELDS } from "./profile-schema";

// 睡眠の目標 2 つだけを入れた最小のフォーム(どの項目も空欄でよい。他の項目のテストの土台に使う)
const base = { targetSleepMinutes: "450", targetSleepMidpoint: "03:15" };

function expectOk(raw: Record<string, unknown>) {
  const result = parseProfileForm(raw);
  if (!result.ok) throw new Error(`検証に失敗: ${JSON.stringify(result.errors)}`);
  return result.values;
}

function expectError(raw: Record<string, unknown>, field: string) {
  const result = parseProfileForm({ ...base, ...raw });
  expect(result.ok, JSON.stringify(raw)).toBe(false);
  if (!result.ok) expect(Object.keys(result.errors), JSON.stringify(raw)).toContain(field);
}

describe("parseProfileForm", () => {
  it("キーがあって空欄の項目は null(その項目を空にする)になる", () => {
    const empty = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, ""]));
    expect(expectOk({ ...empty, ...base })).toEqual({
      gender: null,
      age: null,
      heightCm: null,
      currentWeightKg: null,
      currentBodyFatPercent: null,
      currentWaistCm: null,
      activityLevel: null,
      targetWeightKg: null,
      targetCalories: null,
      targetProteinG: null,
      targetSleepMinutes: 450,
      targetSleepMidpoint: "03:15",
    });
  });

  it("キーが無い項目は結果に含めない(保存しても変更されない)", () => {
    expect(expectOk({})).toEqual({});
    expect(expectOk({ age: "30" })).toEqual({ age: 30 });
    expect(expectOk({ heightCm: "170" })).toEqual({ heightCm: "170.0" });
  });

  it("フォームの値(文字列)を DB の列に合わせた形に直す", () => {
    expect(
      expectOk({
        gender: "male",
        age: "35",
        heightCm: "175",
        currentWeightKg: "80.5",
        currentBodyFatPercent: "22.46",
        currentWaistCm: "85.25",
        activityLevel: "1.375",
        targetWeightKg: "74",
        targetCalories: "1800",
        targetProteinG: "110",
        targetSleepMinutes: "420",
        targetSleepMidpoint: "03:30",
      }),
    ).toEqual({
      gender: "male",
      age: 35,
      heightCm: "175.0",
      currentWeightKg: "80.50",
      currentBodyFatPercent: "22.5", // 小数 1 桁に丸める
      currentWaistCm: "85.3", // 小数 1 桁に丸める
      activityLevel: "1.375",
      targetWeightKg: "74.00",
      targetCalories: 1800,
      targetProteinG: "110.0",
      targetSleepMinutes: 420,
      targetSleepMidpoint: "03:30",
    });
  });

  it("空白だけの欄は未入力として扱い、前後の空白は取る", () => {
    const values = expectOk({ ...base, age: "   ", heightCm: " 170 " });
    expect(values.age).toBeNull();
    expect(values.heightCm).toBe("170.0");
  });

  it("各項目の範囲(profile-limits.ts の app)の端は通り、直外は拒否する", () => {
    const fieldsWithRange = ["age", "heightCm", "currentWeightKg", "currentBodyFatPercent", "currentWaistCm", "targetWeightKg", "targetCalories", "targetProteinG", "targetSleepMinutes"] as const;
    for (const field of fieldsWithRange) {
      const { app, scale } = PROFILE_LIMITS[field];
      const step = 10 ** -scale;
      const text = (value: number) => value.toFixed(scale);

      // 端(含む)は通る
      for (const value of [app.min, app.max]) {
        expect(parseProfileForm({ ...base, [field]: text(value) }).ok, `${field}=${text(value)}`).toBe(true);
      }
      // 直外は拒否する(0 の直外はマイナスなので、符号付きとして拒否される)
      expectError({ [field]: text(app.min - step) }, field);
      expectError({ [field]: text(app.max + step) }, field);
    }
  });

  it("睡眠の中間時刻は HH:MM(00:00〜23:59)だけを受け付ける", () => {
    for (const value of ["00:00", "23:59", "03:15"]) expect(parseProfileForm({ ...base, targetSleepMidpoint: value }).ok).toBe(true);
    for (const value of ["24:00", "03:60", "3:15", "03:5", "abc"]) expectError({ targetSleepMidpoint: value }, "targetSleepMidpoint");
  });

  it("10 進数以外の表記(16 進・指数・符号付き)を拒否する", () => {
    for (const value of ["0x10", "1e2", "0b11", "-5", "+5", "6 0", "5.", ".5", "１７５"]) {
      expectError({ heightCm: value }, "heightCm");
      expectError({ age: value }, "age");
    }
  });

  it("性別と活動係数は、選択肢にある値だけを受け付ける", () => {
    for (const gender of ["male", "female", "other"]) expect(expectOk({ ...base, gender }).gender).toBe(gender);
    expectError({ gender: "robot" }, "gender");
    expectError({ gender: "MALE" }, "gender");

    for (const level of ["1.200", "1.375", "1.550", "1.725", "1.900"]) {
      expect(expectOk({ ...base, activityLevel: level }).activityLevel).toBe(level);
    }
    expectError({ activityLevel: "1.4" }, "activityLevel");
    expectError({ activityLevel: "2" }, "activityLevel");
  });

  it("睡眠の目標 2 つは、空欄にすると null になる(睡眠の機能を使わない)", () => {
    const values = expectOk({ targetSleepMinutes: "", targetSleepMidpoint: "" });
    expect(values.targetSleepMinutes).toBeNull();
    expect(values.targetSleepMidpoint).toBeNull();
    // キーが無い(送られていない)なら、変更しないだけ
    expect(expectOk({})).toEqual({});
  });

  it("複数の欄が誤りなら、欄ごとにエラーを返す", () => {
    const result = parseProfileForm({ ...base, age: "200", heightCm: "abc", gender: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["age", "gender", "heightCm"]);
  });

  it("文字列以外の値や余計なキー(user_id など)は、結果に含めない", () => {
    expectError({ age: 35 }, "age"); // フォームは常に文字列で届く
    const values = expectOk({ ...base, userId: "other", user_id: "other", id: "5", createdAt: "x" });
    expect(Object.keys(values).sort()).toEqual(["targetSleepMidpoint", "targetSleepMinutes"]);
  });
});
