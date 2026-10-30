import { describe, expect, it } from "vitest";
import { ACTIVITY_LEVEL_OPTIONS, activityLevelLabel, activityLevelParts, genderLabel } from "./profile-options";

describe("ACTIVITY_LEVEL_OPTIONS", () => {
  it("選択肢の表示に、掛ける数字が先頭に出る", () => {
    expect(ACTIVITY_LEVEL_OPTIONS.map((option) => option.label)).toEqual([
      "1.2 座りがち(運動はほとんどしない)",
      "1.375 軽い(週1〜3回の軽い運動)",
      "1.55 ふつう(週3〜5回の運動)",
      "1.725 高い(週6〜7回の運動)",
      "1.9 非常に高い(肉体労働や毎日の激しい運動)",
    ]);
  });

  it("値は DB の形(小数 3 桁の文字列)のまま", () => {
    expect(ACTIVITY_LEVEL_OPTIONS.map((option) => option.value)).toEqual(["1.200", "1.375", "1.550", "1.725", "1.900"]);
  });
});

describe("activityLevelLabel", () => {
  it("DB の値(\"1.375\" など)を、選択肢と同じ表示にする", () => {
    expect(activityLevelLabel("1.375")).toBe("1.375 軽い(週1〜3回の軽い運動)");
    expect(activityLevelLabel("1.200")).toBe("1.2 座りがち(運動はほとんどしない)");
  });

  it("未入力は null、選択肢にない値は数字だけを返す", () => {
    expect(activityLevelLabel(null)).toBeNull();
    expect(activityLevelLabel("1.450")).toBe("1.45");
  });
});

describe("activityLevelParts", () => {
  it("選択肢の値は、名前・掛ける数字・説明に分ける(末尾の 0 は除く)", () => {
    expect(activityLevelParts("1.375")).toEqual({ name: "軽い", multiplier: "1.375", detail: "週1〜3回の軽い運動" });
    expect(activityLevelParts("1.200")).toEqual({ name: "座りがち", multiplier: "1.2", detail: "運動はほとんどしない" });
    expect(activityLevelParts("1.550")?.multiplier).toBe("1.55");
  });

  it("未入力は null、選択肢にない値は名前と説明が null で数字だけ", () => {
    expect(activityLevelParts(null)).toBeNull();
    expect(activityLevelParts("1.450")).toEqual({ name: null, multiplier: "1.45", detail: null });
  });
});

describe("genderLabel", () => {
  it("選択肢はラベルにし、未知の値と未入力はそのまま返す", () => {
    expect(genderLabel("male")).toBe("男性");
    expect(genderLabel("x")).toBe("x");
    expect(genderLabel(null)).toBeNull();
  });
});
