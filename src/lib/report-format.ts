import { BADGE_LABELS, BADGE_TIER_LABELS, type Badge } from "@/lib/report-badges";
import { REPORT_KIND_LABELS, type ReportKind } from "@/lib/report-period";

// レポートの表示用の整形(DB も画面の部品も読まない)
export const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export const periodLabel = (start: string, end: string) => `${shortDate(start)}〜${shortDate(end)}`;

// 題名: 随時は「直近 4 週間(10/8〜11/4)」、月次は「2026 年 10 月」
export const reportTitle = (kind: ReportKind, start: string, end: string) => (kind === "monthly" ? monthLabel(start.slice(0, 7)) : `${REPORT_KIND_LABELS[kind]}(${periodLabel(start, end)})`);

export const monthLabel = (month: string) => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`;

export const badgeLabel = (badge: Badge) => `${BADGE_LABELS[badge.key]} ${BADGE_TIER_LABELS[badge.tier]}`;

// 「収まった日」の説明(バッジの横に出す)。運動は週の数
export const badgeDetail = (badge: Badge) => `${badge.judged} ${badge.unit === "day" ? "日" : "週"}のうち ${badge.passed} ${badge.unit === "day" ? "日" : "週"}`;
