import { periodActivityLevel } from "@/lib/report-exercise";
import type { DayRecord } from "@/lib/report-input";
import { buildMonthSummary, type MonthSummary } from "@/lib/report-month";
import type { MonthThemes } from "@/lib/month-themes-ai";
import type { LongTermPeriod } from "@/lib/long-term-period";
import { LONG_TERM_KIND_LABELS } from "@/lib/long-term-period";
import type { TrendViews } from "@/lib/trend-views";

// 長期レポート(四半期・年。docs/ai-feedback.md)の、AI に渡す入力を作る(DB を読まない純粋な関数。AI は使わない)。
// 渡すのは、月ごとのまとめ(lib/report-month.ts)と、コードで計算した推移だけ。日ごとの生データも、日記の全文も渡さない。
// 日記は、月ごとのテーマ(短いラベル。lib/month-themes.ts)だけ。null は、記録していない・まだ取っていないという意味(0 ではない)

// 日ごとの点を、月ごとに切って、1 か月のまとめにする。views の点は、dates と同じ並び。months は数える月(終わった月)
export function buildMonthSummaries(args: {
  months: readonly string[];
  dates: readonly string[];
  views: TrendViews;
  records: readonly DayRecord[];
  rows: readonly { date: string; profileActivityLevel: string | null }[];
  profileActivityLevel: string | null;
}): MonthSummary[] {
  const { months, dates, views, records, rows, profileActivityLevel } = args;
  return months.map((month) => {
    const indices = dates.flatMap((date, i) => (date.startsWith(`${month}-`) ? [i] : []));
    const monthDates = indices.map((i) => dates[i]);
    return buildMonthSummary({
      month,
      dates: monthDates,
      sleep: indices.map((i) => views.sleep[i]),
      weight: indices.map((i) => views.weight[i]),
      bodyFat: indices.map((i) => views.bodyFat[i]),
      calories: indices.map((i) => views.calories[i]),
      records: records.filter((r) => r.日付.startsWith(`${month}-`)),
      activityLevel: periodActivityLevel(rows, monthDates, profileActivityLevel),
    });
  });
}

type Point = { 月: string; 値: number | null };
const series = (summaries: readonly MonthSummary[], pick: (s: MonthSummary) => number | null): Point[] => summaries.map((s) => ({ 月: s.月, 値: pick(s) }));
const round1 = (value: number) => Math.round(value * 10) / 10;

// いちばん高かった月と、低かった月(値のある月が 2 つ以上のとき。同じ値なら、新しい月)
function extremes(points: readonly Point[]) {
  const valued = points.flatMap((p) => (p.値 === null ? [] : [{ 月: p.月, 値: p.値 }]));
  if (valued.length < 2) return null;
  const high = valued.reduce((best, p) => (p.値 >= best.値 ? p : best));
  const low = valued.reduce((best, p) => (p.値 <= best.値 ? p : best));
  return { いちばん高かった月: high, いちばん低かった月: low };
}

// 栄養素ごとの、各月の「目標の範囲内の日数の割合(%)」。判定した日が無い月は null
function nutritionSeries(summaries: readonly MonthSummary[]): Record<string, Point[]> {
  const names = [...new Set(summaries.flatMap((s) => s.栄養?.栄養素.map((n) => n.栄養素) ?? []))];
  return Object.fromEntries(
    names.map((name) => [
      name,
      summaries.map((s): Point => {
        const row = s.栄養?.栄養素.find((n) => n.栄養素 === name);
        return { 月: s.月, 値: row === undefined || row.判定した日数 === 0 ? null : Math.round((row.目標の範囲内の日数 / row.判定した日数) * 100) };
      }),
    ]),
  );
}

export type LongTermInput = {
  期間: { 種類: string; 題名: string; 開始: string; 終了: string; 月数: number };
  数えた月: string[];
  記録が足りない月: string[];
  月ごとのまとめ: MonthSummary[];
  推移: Record<string, unknown>;
  体重の期間全体の変化: { 最初: { 日付: string; kg: number }; 最後: { 日付: string; kg: number }; 変化kg: number } | null;
};

export function buildLongTermInput(args: {
  period: LongTermPeriod;
  end: string; // 実際に数えた期間の終わり(解禁前の開発用は、終わった月の末日まで)
  summaries: readonly MonthSummary[]; // 数える月(終わった月)のまとめ
  usableMonths: readonly string[]; // その中で、記録が十分にある月
  themes: ReadonlyMap<string, MonthThemes>;
}): LongTermInput {
  const { period, end, summaries, usableMonths, themes } = args;
  // 使える月だけを、AI に渡す(記録が足りない月は、数字を傾向の根拠にしない)。足りない月は、名前だけ伝える
  const usable = summaries.filter((s) => usableMonths.includes(s.月)).map(
    (s): MonthSummary => {
      const t = themes.get(s.月);
      return { ...s, 日記: { ...s.日記, テーマ: t === undefined ? null : { 悩み: t.worries, 達成: t.wins, 話題: t.topics } } };
    },
  );
  const weights = usable.flatMap((s) => [s.体重.最初の記録, s.体重.最後の記録]).filter((w): w is { 日付: string; 値: number } => w !== null);
  const first = weights.length === 0 ? null : weights.reduce((a, b) => (b.日付 < a.日付 ? b : a));
  const last = weights.length === 0 ? null : weights.reduce((a, b) => (b.日付 > a.日付 ? b : a));

  return {
    期間: { 種類: LONG_TERM_KIND_LABELS[period.kind], 題名: period.title, 開始: period.start, 終了: end, 月数: summaries.length },
    数えた月: usable.map((s) => s.月),
    記録が足りない月: summaries.filter((s) => !usableMonths.includes(s.月)).map((s) => s.月),
    月ごとのまとめ: usable,
    推移: {
      睡眠時間の中央値分: series(usable, (s) => s.睡眠.睡眠時間の中央値分),
      体重の月末の記録kg: series(usable, (s) => s.体重.最後の記録?.値 ?? null),
      体脂肪率の月末の記録: series(usable, (s) => s.体脂肪率.最後の記録?.値 ?? null),
      摂取kcalの中央値: series(usable, (s) => s.食事.摂取kcalの中央値),
      差の合計: series(usable, (s) => s.食事.差の合計),
      "24時以降に食べた日数": series(usable, (s) => s.食事["24時以降に食べた日数"]),
      運動した日数: series(usable, (s) => s.運動.運動した日数),
      記録のある日数: series(usable, (s) => s.記録のある日数),
      栄養素ごとの目標の範囲内の日数の割合: nutritionSeries(usable),
      高低: {
        睡眠時間の中央値分: extremes(series(usable, (s) => s.睡眠.睡眠時間の中央値分)),
        摂取kcalの中央値: extremes(series(usable, (s) => s.食事.摂取kcalの中央値)),
        運動した日数: extremes(series(usable, (s) => s.運動.運動した日数)),
      },
    },
    体重の期間全体の変化: first === null || last === null || first.日付 === last.日付 ? null : { 最初: { 日付: first.日付, kg: first.値 }, 最後: { 日付: last.日付, kg: last.値 }, 変化kg: round1(last.値 - first.値) },
  };
}
