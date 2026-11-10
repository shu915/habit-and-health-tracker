import { describe, expect, it } from "vitest";
import { badgeSentence, reportFileName } from "./report-format";

describe("reportFileName: PDF のファイル名の初期値", () => {
  it("月次: アプリ名_月次_年-月", () => {
    expect(reportFileName("monthly", "2026-10-01", "2026-10-31")).toBe("habit-health_月次_2026-10");
  });

  it("四半期・年次: 期間の id(2026-Q3、2026)", () => {
    expect(reportFileName("quarterly", "2026-07-01", "2026-09-30")).toBe("habit-health_四半期_2026-Q3");
    expect(reportFileName("yearly", "2025-01-01", "2025-12-31")).toBe("habit-health_年次_2025");
  });

  it("随時(直近 4 週間): 開始日_終了日(日付順に並ぶ形)", () => {
    expect(reportFileName("four-weeks", "2026-10-10", "2026-11-06")).toBe("habit-health_随時_2026-10-10_2026-11-06");
  });

  it("ファイル名に使えない文字(/ : など)を含まない", () => {
    for (const name of [reportFileName("monthly", "2026-10-01", "2026-10-31"), reportFileName("quarterly", "2026-07-01", "2026-09-30"), reportFileName("four-weeks", "2026-10-10", "2026-11-06")]) {
      expect(name).not.toMatch(/[\\/:*?"<>|]/);
    }
  });
});

describe("badgeSentence: バッジの横の文(折り返しのために、2 つの塊に分けて返す)", () => {
  it("睡眠・カロリー・運動は「範囲に収まりました」。運動は週で数える", () => {
    expect(badgeSentence({ key: "sleep", tier: "gold", passed: 24, judged: 25, unit: "day" })).toEqual({ count: "25 日のうち 24 日が", result: "範囲に収まりました" });
    expect(badgeSentence({ key: "exercise", tier: "bronze", passed: 2, judged: 4, unit: "week" })).toEqual({ count: "4 週のうち 2 週が", result: "範囲に収まりました" });
  });

  it("継続は、範囲ではなく「記録がありました」(記録のあった日の数)", () => {
    expect(badgeSentence({ key: "record", tier: "silver", passed: 24, judged: 28, unit: "day" })).toEqual({ count: "28 日のうち 24 日に", result: "記録がありました" });
  });

  it("2 つをつなげると、1 つのつながった文になる", () => {
    const { count, result } = badgeSentence({ key: "record", tier: "gold", passed: 365, judged: 365, unit: "day" });
    expect(`${count}${result}`).toBe("365 日のうち 365 日に記録がありました");
  });
});
