import { z } from "zod";
import { isValidDateString } from "@/lib/date";

// AI が返すレポートの中身(JSON)の形と検証(docs/ai-feedback.md)。AI の返事は信用せず、zod で検証したうえで、
// 期間の外・実在しない日付、決めていない項目のキーを捨てる(注目日付は、グラフの印になるので、期間の中の日付だけを通す)。
// 評価(成績・点数・段階)は持たない。バッジは、コードが条件で決める(lib/report-badges.ts)

export const SECTION_KEYS = ["sleep", "body", "nutrition", "exercise", "mind", "habit"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_LABELS: Record<SectionKey, string> = {
  sleep: "睡眠",
  body: "体",
  nutrition: "食事と栄養",
  exercise: "運動",
  mind: "気持ち・日記",
  habit: "記録の習慣",
};

const isSectionKey = (value: string): value is SectionKey => (SECTION_KEYS as readonly string[]).includes(value);

// 検証は、形(必要な欄があるか)と、明らかな異常(極端に長い文字列)だけを見る。個数や、ふつうの長さのはみ出しは、失敗にせず、あとで切り詰める
// (15 秒かけた返事を、細かい上限で、まるごと捨てない。試作の実行で、注目日付が多すぎて失敗した)。文字列の上限は、異常を弾くための、ゆるい値
const MAX_TEXT = 5000;
const text = z.string().max(MAX_TEXT);
const rawFinding = z.object({ text: text.min(1), dates: z.array(z.string()) });
const rawContent = z.object({
  sections: z.array(z.object({ key: z.string(), headline: text, findings: z.array(rawFinding) })),
  overall: z.object({
    summary: text.min(1),
    good_points: z.array(text),
    watch_points: z.array(text),
    discoveries: z.array(z.object({ title: text, text: text.min(1), dates: z.array(z.string()) })),
    next_steps: z.array(z.object({ text: text.min(1), sections: z.array(z.string()) })),
  }),
});

// 切り詰める個数(プロンプトで頼んでいる個数より、少しゆるく)
export const LIMITS = { findingsPerSection: 5, goodPoints: 5, watchPoints: 5, discoveries: 3, nextSteps: 3, dates: 5 } as const;

export type Finding = { text: string; dates: string[] };
export type ReportContent = {
  sections: { key: SectionKey; headline: string; findings: Finding[] }[];
  overall: {
    summary: string;
    good_points: string[];
    watch_points: string[];
    discoveries: { title: string; text: string; dates: string[] }[];
    next_steps: { text: string; sections: SectionKey[] }[];
  };
};

export type ParseResult = { ok: true; content: ReportContent } | { ok: false; reason: string };

// 注目日付: 実在する日付で、期間の中にあるものだけ。重複を除き、古い順に、最大 LIMITS.dates 個
export function sanitizeDates(dates: readonly string[], period: { start: string; end: string }): string[] {
  return [...new Set(dates.filter((d) => isValidDateString(d) && d >= period.start && d <= period.end))].sort().slice(0, LIMITS.dates);
}

// AI の返事(JSON の文字列)を検証して、整えた中身を返す。形が違う返事は失敗にする(保存しない)
export function parseReportContent(text: string, period: { start: string; end: string }): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "JSON として読めない" };
  }
  const parsed = rawContent.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `形が違う: ${parsed.error.issues[0]?.path.join(".") ?? ""}` };
  const raw = parsed.data;

  const seen = new Set<SectionKey>();
  const sections = raw.sections.flatMap((section) => {
    if (!isSectionKey(section.key) || seen.has(section.key)) return []; // 決めていない項目・重複は捨てる
    seen.add(section.key);
    return [{ key: section.key, headline: section.headline, findings: section.findings.slice(0, LIMITS.findingsPerSection).map((f) => ({ text: f.text, dates: sanitizeDates(f.dates, period) })) }];
  });
  const overall = raw.overall;
  return {
    ok: true,
    content: {
      sections,
      overall: {
        summary: overall.summary,
        good_points: overall.good_points.slice(0, LIMITS.goodPoints),
        watch_points: overall.watch_points.slice(0, LIMITS.watchPoints),
        discoveries: overall.discoveries.slice(0, LIMITS.discoveries).map((d) => ({ title: d.title, text: d.text, dates: sanitizeDates(d.dates, period) })),
        next_steps: overall.next_steps.slice(0, LIMITS.nextSteps).map((s) => ({ text: s.text, sections: [...new Set(s.sections.filter(isSectionKey))] })),
      },
    },
  };
}

// 保存済みの JSON を読み戻す(保存のときに検証済みだが、形が変わった古い行でも落ちないよう、もう一度通す)
export function readStoredContent(value: unknown, period: { start: string; end: string }): ReportContent | null {
  const result = parseReportContent(JSON.stringify(value), period);
  return result.ok ? result.content : null;
}
