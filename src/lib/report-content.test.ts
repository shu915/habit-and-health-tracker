import { describe, expect, it } from "vitest";
import { parseReportContent, readStoredContent, sanitizeDates } from "./report-content";

const period = { start: "2026-10-09", end: "2026-11-05" };
const valid = {
  sections: [
    { key: "sleep", headline: "就寝が遅めです", findings: [{ text: "中央値は 5 時間 52 分です。", dates: ["2026-10-12", "2026-10-13"] }] },
    { key: "mind", headline: "夜食のことを書いていました", findings: [] },
  ],
  overall: {
    summary: "まとめです。",
    good_points: ["記録を続けられています"],
    watch_points: [],
    discoveries: [{ title: "平日のほうが多い", text: "平日は 2,585 kcal、休日は 1,975 kcal でした。", dates: ["2026-10-12"] }],
    next_steps: [{ text: "朝に歩いてみましょう", sections: ["exercise", "sleep"] }],
  },
};

describe("sanitizeDates(注目日付)", () => {
  it("期間の中の実在する日付だけを、重複なし・古い順・最大 5 個で通す", () => {
    expect(sanitizeDates(["2026-10-20", "2026-10-10", "2026-10-20", "2026-10-30", "2026-11-01", "2026-10-15", "2026-10-25"], period)).toEqual(["2026-10-10", "2026-10-15", "2026-10-20", "2026-10-25", "2026-10-30"]);
  });
  it("期間の外・実在しない日付・形が違う文字列は捨てる", () => {
    expect(sanitizeDates(["2026-10-08", "2026-11-06", "2026-02-30", "10/12", "", "2026-10-12"], period)).toEqual(["2026-10-12"]);
  });
});

describe("parseReportContent", () => {
  it("正しい返事を通す。注目日付と項目のキーは、期間・決めたキーに整える", () => {
    const text = JSON.stringify({
      ...valid,
      sections: [...valid.sections, { key: "weather", headline: "天気", findings: [] }, { key: "sleep", headline: "重複", findings: [] }],
      overall: { ...valid.overall, next_steps: [{ text: "歩く", sections: ["exercise", "unknown", "exercise"] }], discoveries: [{ title: "t", text: "x", dates: ["2026-12-01", "2026-10-12"] }] },
    });
    const result = parseReportContent(text, period);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.sections.map((s) => s.key)).toEqual(["sleep", "mind"]); // 決めていない項目・重複は捨てる
    expect(result.content.overall.next_steps[0].sections).toEqual(["exercise"]); // 不正なキー・重複は捨てる
    expect(result.content.overall.discoveries[0].dates).toEqual(["2026-10-12"]); // 期間の外は捨てる
  });

  it("JSON として読めない返事、必要な欄が無い返事、異常に長い文字列は失敗にする(保存しない)", () => {
    expect(parseReportContent("これは JSON ではありません", period)).toMatchObject({ ok: false });
    expect(parseReportContent(JSON.stringify({ sections: [] }), period)).toMatchObject({ ok: false });
    expect(parseReportContent(JSON.stringify({ ...valid, overall: { ...valid.overall, summary: "" } }), period)).toMatchObject({ ok: false });
    expect(parseReportContent(JSON.stringify({ ...valid, overall: { ...valid.overall, summary: "あ".repeat(5001) } }), period)).toMatchObject({ ok: false });
  });

  it("個数や、ふつうの長さのはみ出しは、失敗にせず切り詰める(注目日付が多すぎる、気づきが多すぎる、など)。15 秒かけた返事を捨てない", () => {
    const manyDates = Array.from({ length: 20 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);
    const text = JSON.stringify({
      sections: [{ key: "mind", headline: "見出し", findings: Array.from({ length: 9 }, (_, i) => ({ text: `気づき ${i}`, dates: manyDates })) }],
      overall: {
        summary: "あ".repeat(2000),
        good_points: Array.from({ length: 8 }, (_, i) => `良かった ${i}`),
        watch_points: Array.from({ length: 8 }, (_, i) => `気になる ${i}`),
        discoveries: Array.from({ length: 6 }, (_, i) => ({ title: `発見 ${i}`, text: "本文", dates: manyDates })),
        next_steps: Array.from({ length: 6 }, (_, i) => ({ text: `次の一歩 ${i}`, sections: ["sleep"] })),
      },
    });
    const result = parseReportContent(text, period);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { sections, overall } = result.content;
    expect(sections[0].findings).toHaveLength(5);
    expect(sections[0].findings[0].dates).toHaveLength(5);
    expect(overall.good_points).toHaveLength(5);
    expect(overall.watch_points).toHaveLength(5);
    expect(overall.discoveries).toHaveLength(3);
    expect(overall.discoveries[0].dates).toHaveLength(5);
    expect(overall.next_steps).toHaveLength(3);
    expect(overall.summary).toHaveLength(2000); // ふつうの長さの超過は、切らずに通す
  });

  it("評価(rating)のような余計な欄があっても、無視して通す(中身には持たない)", () => {
    const withRating = { ...valid, sections: valid.sections.map((s) => ({ ...s, rating: "good" })) };
    const result = parseReportContent(JSON.stringify(withRating), period);
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.content)).not.toContain("rating");
  });
});

describe("readStoredContent", () => {
  it("保存済みの値を読み戻す。形が壊れていれば null", () => {
    expect(readStoredContent(valid, period)?.sections).toHaveLength(2);
    expect(readStoredContent({ broken: true }, period)).toBeNull();
  });
});
