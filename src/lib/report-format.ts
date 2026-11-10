import { BADGE_LABELS, BADGE_TIER_LABELS, type Badge } from "@/lib/report-badges";
import { longTermIdOf, longTermPeriod, type LongTermKind } from "@/lib/long-term-period";
import { isLongTermReportKind, REPORT_KIND_LABELS, type ReportKind } from "@/lib/report-period";

// レポートの表示用の整形(DB も画面の部品も読まない)
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export const periodLabel = (start: string, end: string) => `${shortDate(start)}〜${shortDate(end)}`;

// 題名: 随時は「直近 4 週間(10/8〜11/4)」、月次は「2026 年 10 月」、四半期は「2026 年 7〜9 月(第 3 四半期)」、年は「2026 年」
export function reportTitle(kind: ReportKind, start: string, end: string): string {
  if (kind === "monthly") return monthLabel(start.slice(0, 7));
  if (isLongTermReportKind(kind)) {
    const id = longTermIdOf(kind as LongTermKind, start);
    const period = id === null ? null : longTermPeriod(kind as LongTermKind, id);
    return period === null ? `${REPORT_KIND_LABELS[kind]}(${periodLabel(start, end)})` : period.title;
  }
  return `${REPORT_KIND_LABELS[kind]}(${periodLabel(start, end)})`;
}

// PDF で保存するときのファイル名の初期値(拡張子は、ブラウザが付ける)。「アプリ名_種類_期間」にそろえる(2026-11-09、利用者の決定)。
// 月次 habit-health_月次_2026-10 / 四半期 habit-health_四半期_2026-Q3 / 年次 habit-health_年次_2026 / 随時 habit-health_随時_2026-10-10_2026-11-06。
// 期間は、日付順に並ぶ形。ファイル名に使えない文字(/ : など)は含めない
export function reportFileName(kind: ReportKind, start: string, end: string): string {
  const prefix = "habit-health";
  if (kind === "monthly") return `${prefix}_月次_${start.slice(0, 7)}`;
  if (isLongTermReportKind(kind)) {
    const id = longTermIdOf(kind as LongTermKind, start);
    return `${prefix}_${kind === "yearly" ? "年次" : "四半期"}_${id ?? start}`;
  }
  return `${prefix}_随時_${start}_${end}`;
}

export const monthLabel = (month: string) => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`;

export const badgeLabel = (badge: Badge) => `${BADGE_LABELS[badge.key]} ${BADGE_TIER_LABELS[badge.tier]}`;

// バッジの説明(バッジの横に出す)。「N 日のうち M 日が」+「範囲に収まりました」(運動は週。継続は「記録がありました」)の 2 つの塊。
// 画面が、狭い幅で、塊のあいだだけで折り返すよう、2 つに分けて返す
export function badgeSentence(badge: Badge): { count: string; result: string } {
  const unit = badge.unit === "day" ? "日" : "週";
  if (badge.key === "record") return { count: `${badge.judged} ${unit}のうち ${badge.passed} ${unit}に`, result: "記録がありました" };
  return { count: `${badge.judged} ${unit}のうち ${badge.passed} ${unit}が`, result: "範囲に収まりました" };
}
