import { describe, expect, it } from "vitest";
import { defaultMealDayAndTime } from "./meal-time";
import { isFinishedDay } from "./day-result";
import { todayString } from "./date";
import { formatDateInAppZone, zonedParts } from "./time-zone";

// 時計は日本時間に固定してある。テストを動かす機械のタイムゾーンによらず、同じ結果になる(CI は UTC)。
// 瞬間は UTC で書く(日本時間は UTC + 9 時間)
describe("zonedParts", () => {
  it("瞬間を、日本時間の年・月・日・時・分にする", () => {
    expect(zonedParts(new Date("2026-11-09T15:30:00Z"))).toEqual({ year: 2026, month: 11, day: 10, hour: 0, minute: 30 });
    expect(zonedParts(new Date("2026-11-09T00:00:00Z"))).toEqual({ year: 2026, month: 11, day: 9, hour: 9, minute: 0 });
  });

  it("日付の変わり目: 日本時間の 0 時は 0(24 ではない)。年をまたぐ", () => {
    expect(zonedParts(new Date("2026-12-31T15:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1, hour: 0, minute: 0 });
  });
});

describe("日本時間で、サーバーが UTC でも、利用者の「今」になる(本番の不具合の再現)", () => {
  // UTC 20:00 = 日本時間の翌日 05:00。UTC のサーバーは、まだ前の日だと思う時間帯(日本時間の 03:00〜09:00)
  const earlyMorningInJapan = new Date("2026-10-29T20:00:00Z");

  it("今日は、日本の日付(UTC の前の日ではない)", () => {
    expect(todayString(earlyMorningInJapan)).toBe("2026-10-30");
  });

  it("「今の食事の日」と初期の時刻も、日本時間(05:00 は、その日の食事)", () => {
    expect(defaultMealDayAndTime(earlyMorningInJapan)).toEqual({ date: "2026-10-30", time: "05:00" });
    // 日本時間 01:30(UTC 16:30)は、前の日の食事として 25:30
    expect(defaultMealDayAndTime(new Date("2026-10-29T16:30:00Z"))).toEqual({ date: "2026-10-29", time: "25:30" });
  });

  it("過ぎた日の判定: 日本時間で日付が変わったら、前の日は、もう過ぎた日(UTC では、まだ書きかけに見える時間帯)", () => {
    expect(isFinishedDay("2026-10-29", earlyMorningInJapan)).toBe(true);
    expect(isFinishedDay("2026-10-30", earlyMorningInJapan)).toBe(false);
  });
});

describe("formatDateInAppZone: 表示用の日付", () => {
  it("日本時間の日付で出す(UTC では前の日になる午前でも)", () => {
    // UTC の 2026-11-09 23:00 = 日本時間の 2026-11-10 08:00
    expect(formatDateInAppZone(new Date("2026-11-09T23:00:00Z"))).toBe("2026/11/10");
  });
});
