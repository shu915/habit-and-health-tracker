import "server-only";
import { defaultMealDayAndTime } from "@/lib/meal-time";
import { getEarliestRecordedDate, listRecordKinds } from "@/lib/record-kinds";
import { monthPeriod, reportEligibility, reportPeriod, selectableMonths, type Eligibility, type ReportPeriod } from "@/lib/report-period";
import { isOnDemandUsedToday, listReports } from "@/lib/reports";

// 「作る」画面に出す、レポートの期間と作れる条件・状態(docs/ai-feedback.md)。記録のある日は、必要な期間を、まとめて 1 回で取る。
// 随時(直近 4 週間): creatingId = 作成中のレポートの id / blockedToday = 今日(03:00 区切り)もう作った(1 日に 1 回まで)。
// 月次(定期): 選べる月は、記録のある最初の月から、先月まで(新しい月が先。初期値は先月)。月ごとに、作れる条件・作成済み(existingId)・作成中(creatingId)。同じ月は 1 回だけ
export type OnDemandOption = { period: ReportPeriod; eligibility: Eligibility; creatingId: number | null; blockedToday: boolean };
export type MonthOption = { month: string; period: ReportPeriod; eligibility: Eligibility; existingId: number | null; creatingId: number | null };
export type ReportOptions = { onDemand: OnDemandOption; months: MonthOption[] };

export async function getReportOptions(): Promise<ReportOptions> {
  const mealDay = defaultMealDayAndTime().date;
  const fourWeeks = reportPeriod("four-weeks", mealDay);
  const earliest = await getEarliestRecordedDate();
  const months = selectableMonths(mealDay, earliest);
  const monthPeriods = months.map((month) => monthPeriod(month));
  const from = [fourWeeks.start, ...monthPeriods.map((p) => p.start)].reduce((min, d) => (d < min ? d : min));
  const to = [fourWeeks.end, ...monthPeriods.map((p) => p.end)].reduce((max, d) => (d > max ? d : max));
  const [recorded, reports, usedToday] = await Promise.all([listRecordKinds(from, to), listReports(), isOnDemandUsedToday()]);
  return {
    onDemand: {
      period: fourWeeks,
      eligibility: reportEligibility(fourWeeks, recorded.keys()),
      creatingId: reports.find((r) => r.kind === "four-weeks" && r.status === "creating")?.id ?? null,
      blockedToday: usedToday,
    },
    months: monthPeriods.map((period, i) => {
      const own = reports.filter((r) => r.kind === "monthly" && r.periodStart === period.start);
      return {
        month: months[i],
        period,
        eligibility: reportEligibility(period, recorded.keys()),
        existingId: own.find((r) => r.status === "done" || r.status === "creating")?.id ?? null,
        creatingId: own.find((r) => r.status === "creating")?.id ?? null,
      };
    }),
  };
}
