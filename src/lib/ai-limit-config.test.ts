import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_LIMIT, resolveDailyLimit } from "./ai-limit-config";

describe("resolveDailyLimit(食事の AI 推定の、1 日の上限)", () => {
  it("本番とテストは、何も指定しなければ 20 回(保険は、既定で効く)", () => {
    expect(DEFAULT_DAILY_LIMIT).toBe(20);
    expect(resolveDailyLimit({ NODE_ENV: "production" })).toBe(20);
    expect(resolveDailyLimit({ NODE_ENV: "test" })).toBe(20);
    expect(resolveDailyLimit({})).toBe(20);
  });

  it("開発サーバーは、何も指定しなければ上限なし(手で試すとき、上限では足りない)", () => {
    expect(resolveDailyLimit({ NODE_ENV: "development" })).toBe(Number.POSITIVE_INFINITY);
  });

  it("環境変数に 1 以上の整数があれば、どの環境でも、その値(本番で変える・開発で絞る)", () => {
    expect(resolveDailyLimit({ NODE_ENV: "production", MEAL_ESTIMATE_DAILY_LIMIT: "30" })).toBe(30);
    expect(resolveDailyLimit({ NODE_ENV: "development", MEAL_ESTIMATE_DAILY_LIMIT: " 5 " })).toBe(5);
  });

  it("読めない値(0・負・小数・文字・空)は無視して、環境ごとの既定にする(うっかり上限なしになったり、全部断ったりしない)", () => {
    for (const bad of ["0", "-3", "2.5", "abc", "", "1e3", "０"]) {
      expect(resolveDailyLimit({ NODE_ENV: "production", MEAL_ESTIMATE_DAILY_LIMIT: bad })).toBe(20);
    }
    expect(resolveDailyLimit({ NODE_ENV: "development", MEAL_ESTIMATE_DAILY_LIMIT: "0" })).toBe(Number.POSITIVE_INFINITY);
  });
});
