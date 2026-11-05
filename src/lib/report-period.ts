import { shiftDate } from "@/lib/date";

// AI フィードバック(レポート)の期間と、作れる条件(docs/ai-feedback.md)。DB は読まない純粋な関数。
// 種類: 随時(今すぐ。直近 4 週間 = 28 日)・定期(月次。過去の、どの暦の月でも、記録が十分にあれば選んで作れる。2026-11-05 に「先月だけ」から広げた)。直近 1 週間(7 日)は、2026-11-05 にやめた: 7 日では、分析材料の比較(各群 3 日以上など)が、ほぼ出ず、バッジも粗いため。4 週間は、その内容をすべて含む。期間は、今の食事の日(03:00 で切り替わる)の前日まで
// (今日は書きかけで、食事が増えるので、含めない)。「今の食事の日」は呼び出し側が決めて渡す(lib/meal-time.ts の defaultMealDayAndTime)
export const REPORT_KINDS = ["four-weeks", "monthly"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  "four-weeks": "直近 4 週間",
  monthly: "月次",
};

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && (REPORT_KINDS as readonly string[]).includes(value);
}

// 随時レポート(今すぐ。直近 4 週間)は、1 日に 1 回まで(2026-11-05、利用者の決定。待ち時間が長く、費用もかかるため)。
// 「1 日」は、食事の日と同じ 03:00 区切り。作成中・できたレポートを数え、失敗した作成は数えない(lib/reports.ts)。定期(先月)は、同じ月を 1 回だけ
export const ON_DEMAND_DAILY_LIMIT = 1;
export const ON_DEMAND_KINDS: readonly ReportKind[] = ["four-weeks"];
export const isOnDemandKind = (kind: ReportKind): boolean => ON_DEMAND_KINDS.includes(kind);

export type ReportPeriod = { kind: ReportKind; start: string; end: string; days: number };

const daysBetween = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;

// 年月("2026-10")。1900〜2100 年の、実在する月
export function isYearMonth(value: string): boolean {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match !== null && Number(match[1]) >= 1900 && Number(match[1]) <= 2100;
}

// 今の食事の日の月より前の月か(今の月は、まだ終わっていないので、作れない。1 日の 03:00 前は、まだ前の月)
export function isPastMonth(month: string, currentMealDay: string): boolean {
  return month < currentMealDay.slice(0, 7);
}

// 暦の月(1 日〜末日)の期間
export function monthPeriod(month: string): ReportPeriod {
  const start = `${month}-01`;
  const next = Number(month.slice(5, 7)) === 12 ? `${Number(month.slice(0, 4)) + 1}-01-01` : `${month.slice(0, 5)}${String(Number(month.slice(5, 7)) + 1).padStart(2, "0")}-01`;
  const end = shiftDate(next, -1);
  return { kind: "monthly", start, end, days: daysBetween(start, end) };
}

// 期間。monthly は、過去の月(month = "YYYY-MM")を必ず渡す(今の月・未来・形が違う値は、呼び出し側の誤りとして例外)
export function reportPeriod(kind: ReportKind, currentMealDay: string, month?: string): ReportPeriod {
  if (kind === "monthly") {
    if (month === undefined || !isYearMonth(month) || !isPastMonth(month, currentMealDay)) throw new Error(`invalid month: ${String(month)}`);
    return monthPeriod(month);
  }
  const days = 28;
  const end = shiftDate(currentMealDay, -1);
  return { kind, start: shiftDate(end, -(days - 1)), end, days };
}

// 選べる月の数の上限(新しい月から)
export const MAX_MONTH_CHOICES = 24;

// 選べる月: 記録のある最初の日の月から、先月まで。新しい月が先。最大 MAX_MONTH_CHOICES か月。記録がまだ無い・最初の日が今の月なら、空
export function selectableMonths(currentMealDay: string, earliestRecordedDate: string | null): string[] {
  if (earliestRecordedDate === null) return [];
  const earliest = earliestRecordedDate.slice(0, 7);
  const months: string[] = [];
  let [year, month] = [Number(currentMealDay.slice(0, 4)), Number(currentMealDay.slice(5, 7))];
  for (let i = 0; i < MAX_MONTH_CHOICES; i++) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const value = `${year}-${String(month).padStart(2, "0")}`;
    if (value < earliest) break;
    months.push(value);
  }
  return months;
}

// 作れる条件: 期間の 7 割以上に、記録のある日があること(偏った記録の分析を避ける。4 週間は 20 日、先月は 20〜22 日)
export const MIN_RECORDED_RATIO = 0.7;

export function requiredRecordedDays(days: number): number {
  return Math.ceil(days * MIN_RECORDED_RATIO);
}

export type Eligibility = { ok: boolean; recorded: number; required: number; missing: number };

// recordedDates: 期間の中の、記録のある日(カレンダーの濃さと同じ定義: 朝の記録・食事・運動・良かったこと・今日の気づきのどれかがある日)
export function reportEligibility(period: ReportPeriod, recordedDates: Iterable<string>): Eligibility {
  const recorded = new Set([...recordedDates].filter((date) => date >= period.start && date <= period.end)).size;
  const required = requiredRecordedDays(period.days);
  return { ok: recorded >= required, recorded, required, missing: Math.max(0, required - recorded) };
}
