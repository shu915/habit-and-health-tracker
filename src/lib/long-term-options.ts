import "server-only";
import { defaultMealDayAndTime } from "@/lib/meal-time";
import { completedMonths, ignoreReleaseDate, longTermEligibility, nextRelease, selectableLongTermPeriods, type LongTermKind } from "@/lib/long-term-period";
import { getEarliestRecordedDate, listRecordKinds } from "@/lib/record-kinds";
import { monthPeriod } from "@/lib/report-period";
import { listReports } from "@/lib/reports";

// 「作る」画面に出す、長期レポート(四半期・年)の、選べる期間と、作れる条件・状態(docs/ai-feedback.md)。記録のある日は、必要な期間を、まとめて 1 回で取る。
// 選べる期間は、記録のある最初の月を含む期間から、解禁された最新の期間まで(新しい期間が先)。開発のときだけ(REPORT_IGNORE_RELEASE_DATE=1)、今の期間も入る(終わった月だけを使う。partial)。
// 同じ期間は 1 回だけ(existingId)。作成中(creatingId)。次に解禁される期間と、あと何日か(next)
export type LongTermOption = {
  id: string; // "2026-Q3" / "2026"
  title: string;
  released: boolean;
  releaseDate: string;
  partial: boolean; // 解禁前で、終わった月だけを使う(開発用)
  usableMonths: number;
  requiredMonths: number;
  missing: number;
  ok: boolean;
  existingId: number | null;
  creatingId: number | null;
};
export type LongTermKindOptions = { choices: LongTermOption[]; next: { title: string; releaseDate: string; daysLeft: number } };
export type LongTermOptions = Record<LongTermKind, LongTermKindOptions>;

const KINDS: readonly LongTermKind[] = ["quarterly", "yearly"];

export async function getLongTermOptions(): Promise<LongTermOptions> {
  const mealDay = defaultMealDayAndTime().date;
  const ignoreRelease = ignoreReleaseDate(process.env);
  const earliest = await getEarliestRecordedDate();
  const choicesByKind = KINDS.map((kind) => ({ kind, choices: selectableLongTermPeriods(kind, mealDay, earliest, { ignoreRelease }) }));
  const used = choicesByKind.flatMap(({ choices }) => choices.map((c) => ({ ...c, months: completedMonths(c.period, mealDay) })));

  // 記録のある日を、必要な範囲だけ、1 回で取る(選べる期間が無ければ、取らない)
  const withMonths = used.filter((u) => u.months.length > 0);
  const recorded = withMonths.length === 0
    ? new Map<string, unknown>()
    : await listRecordKinds(
        withMonths.map((u) => u.period.start).reduce((min, d) => (d < min ? d : min)),
        withMonths.map((u) => monthPeriod(u.months[u.months.length - 1]).end).reduce((max, d) => (d > max ? d : max)),
      );
  const reports = await listReports();

  const build = (kind: LongTermKind): LongTermKindOptions => ({
    choices: (choicesByKind.find((c) => c.kind === kind)?.choices ?? []).map(({ period, released, releaseDate }) => {
      const months = completedMonths(period, mealDay);
      const eligibility = longTermEligibility(months, recorded.keys());
      const own = reports.filter((r) => r.kind === kind && r.periodStart === period.start);
      return {
        id: period.id,
        title: period.title,
        released,
        releaseDate,
        partial: !released,
        usableMonths: eligibility.usableMonths.length,
        requiredMonths: eligibility.requiredMonths,
        missing: eligibility.missing,
        ok: eligibility.ok,
        existingId: own.find((r) => r.status === "done" || r.status === "creating")?.id ?? null,
        creatingId: own.find((r) => r.status === "creating")?.id ?? null,
      };
    }),
    next: (({ period, releaseDate, daysLeft }) => ({ title: period.title, releaseDate, daysLeft }))(nextRelease(kind, mealDay)),
  });
  return { quarterly: build("quarterly"), yearly: build("yearly") };
}
