import { shiftDate } from "@/lib/date";
import { isYearMonth, monthPeriod, requiredRecordedDays } from "@/lib/report-period";

// 長期レポート(四半期・年)の期間と、作れる条件(docs/ai-feedback.md)。DB は読まない純粋な関数。
// 期間は暦に固定する(四半期は 1〜3 月・4〜6 月・7〜9 月・10〜12 月、年は 1〜12 月。1 月始まり。2026-11-09、利用者の決定)。半期は作らない。
// 解禁方式: 期間が終わった翌日(4/1・7/1・10/1・1/1)から、利用者が「作る」を押せる。自動では作らない。
// 「今の食事の日」(03:00 で切り替わる)は、呼び出し側が決めて渡す(lib/meal-time.ts の defaultMealDayAndTime)

export const LONG_TERM_KINDS = ["quarterly", "yearly"] as const;
export type LongTermKind = (typeof LONG_TERM_KINDS)[number];

export const LONG_TERM_KIND_LABELS: Record<LongTermKind, string> = { quarterly: "四半期", yearly: "年" };

export function isLongTermKind(value: unknown): value is LongTermKind {
  return typeof value === "string" && (LONG_TERM_KINDS as readonly string[]).includes(value);
}

// id: 四半期は "2026-Q3"、年は "2026"。months は、期間に含まれる月("2026-07" など)
export type LongTermPeriod = { kind: LongTermKind; id: string; start: string; end: string; months: string[]; title: string };

const pad = (n: number) => String(n).padStart(2, "0");
const validYear = (year: number) => Number.isInteger(year) && year >= 1900 && year <= 2100;

function monthsFrom(year: number, firstMonth: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${year}-${pad(firstMonth + i)}`);
}

function periodOf(kind: LongTermKind, id: string, year: number, firstMonth: number, count: number, title: string): LongTermPeriod {
  const months = monthsFrom(year, firstMonth, count);
  return { kind, id, start: monthPeriod(months[0]).start, end: monthPeriod(months[months.length - 1]).end, months, title };
}

// id から期間を作る。形が違う・年が範囲外なら null
export function longTermPeriod(kind: LongTermKind, id: string): LongTermPeriod | null {
  if (kind === "yearly") {
    if (!/^\d{4}$/.test(id) || !validYear(Number(id))) return null;
    return periodOf("yearly", id, Number(id), 1, 12, `${id} 年`);
  }
  const match = /^(\d{4})-Q([1-4])$/.exec(id);
  if (match === null || !validYear(Number(match[1]))) return null;
  const [year, quarter] = [Number(match[1]), Number(match[2])];
  const first = (quarter - 1) * 3 + 1;
  return periodOf("quarterly", id, year, first, 3, `${year} 年 ${first}〜${first + 2} 月(第 ${quarter} 四半期)`);
}

// 期間のうち、終わった月だけ(今の食事の日の月より前の月)。解禁された期間は、全部の月が終わっている
export function completedMonths(period: LongTermPeriod, currentMealDay: string): string[] {
  return period.months.filter((month) => month < currentMealDay.slice(0, 7));
}

// 解禁日(期間が終わった翌日)と、解禁されているか
export const releaseDate = (period: LongTermPeriod): string => shiftDate(period.end, 1);
export const isReleased = (period: LongTermPeriod, currentMealDay: string): boolean => currentMealDay >= releaseDate(period);

// 開発のときだけ、解禁日を無視できる(デモで、四半期や年を試すため)。環境変数 REPORT_IGNORE_RELEASE_DATE=1 と、開発サーバー(NODE_ENV=development)の両方のときだけ。本番では、環境変数があっても無視する
export function ignoreReleaseDate(env: { NODE_ENV?: string; REPORT_IGNORE_RELEASE_DATE?: string }): boolean {
  return env.NODE_ENV === "development" && env.REPORT_IGNORE_RELEASE_DATE === "1";
}

// 今の食事の日を含む期間(まだ終わっていない期間)
function currentPeriodOf(kind: LongTermKind, currentMealDay: string): LongTermPeriod {
  const [year, month] = [Number(currentMealDay.slice(0, 4)), Number(currentMealDay.slice(5, 7))];
  const found = kind === "yearly" ? longTermPeriod("yearly", String(year)) : longTermPeriod("quarterly", `${year}-Q${Math.floor((month - 1) / 3) + 1}`);
  if (found === null) throw new Error(`invalid date: ${currentMealDay}`);
  return found;
}

// 1 つ前の期間
function previousPeriod(period: LongTermPeriod): LongTermPeriod {
  const found = longTermPeriod(period.kind, previousId(period));
  if (found === null) throw new Error(`no previous period: ${period.id}`);
  return found;
}
function previousId(period: LongTermPeriod): string {
  if (period.kind === "yearly") return String(Number(period.id) - 1);
  const [year, quarter] = [Number(period.id.slice(0, 4)), Number(period.id.slice(6))];
  return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`;
}

// 選べる期間の数の上限(新しい期間から)
export const MAX_LONG_TERM_CHOICES = 12;

export type LongTermChoice = { period: LongTermPeriod; released: boolean; releaseDate: string };

// 選べる期間: 記録のある最初の日の月を含む期間から、解禁された最新の期間まで。新しい期間が先。最大 MAX_LONG_TERM_CHOICES 個。
// ignoreRelease(開発用)のときは、まだ終わっていない今の期間も含める(終わった月だけを使う)。記録がまだ無ければ、空
export function selectableLongTermPeriods(kind: LongTermKind, currentMealDay: string, earliestRecordedDate: string | null, options: { ignoreRelease?: boolean } = {}): LongTermChoice[] {
  if (earliestRecordedDate === null) return [];
  const earliestMonth = earliestRecordedDate.slice(0, 7);
  let period = currentPeriodOf(kind, currentMealDay);
  const choices: LongTermChoice[] = [];
  // 今の期間は、解禁されていないので、ふつうは入らない(開発用に、無視するときだけ入る)
  if (options.ignoreRelease === true && completedMonths(period, currentMealDay).length > 0) choices.push({ period, released: false, releaseDate: releaseDate(period) });
  for (let i = 0; i < MAX_LONG_TERM_CHOICES * 2 && choices.length < MAX_LONG_TERM_CHOICES; i++) {
    period = previousPeriod(period);
    if (period.months[period.months.length - 1] < earliestMonth) break;
    choices.push({ period, released: isReleased(period, currentMealDay), releaseDate: releaseDate(period) });
  }
  return choices;
}

// 次に解禁される期間(今の期間)と、解禁日。「あと何日で作れます」の案内用
export function nextRelease(kind: LongTermKind, currentMealDay: string): { period: LongTermPeriod; releaseDate: string; daysLeft: number } {
  const period = currentPeriodOf(kind, currentMealDay);
  const release = releaseDate(period);
  const daysLeft = Math.round((Date.parse(`${release}T00:00:00Z`) - Date.parse(`${currentMealDay}T00:00:00Z`)) / 86_400_000);
  return { period, releaseDate: release, daysLeft };
}

// 作れる条件: 期間の月のうち、その月の 7 割以上の日に記録がある月(使える月)が、3 分の 2 以上あること(月次と同じ規則を、月ごとにあてる)。
// 四半期(3 か月)なら 3 か月中 2 か月、年(12 か月)なら 12 か月中 8 か月。1 つの月が抜けても、長期の流れは見られるが、半分以上が抜けると、偏るため。
// months は、数える月(終わった月だけ)。recordedDates は、記録のある日(カレンダーの濃さと同じ定義)
export const requiredUsableMonths = (monthCount: number): number => Math.ceil((monthCount * 2) / 3);

export type MonthEligibility = { month: string; recorded: number; required: number; usable: boolean };
export type LongTermEligibility = { ok: boolean; usableMonths: string[]; requiredMonths: number; missing: number; months: MonthEligibility[] };

export function longTermEligibility(months: readonly string[], recordedDates: Iterable<string>): LongTermEligibility {
  const recorded = new Set(recordedDates);
  const perMonth: MonthEligibility[] = months.map((month) => {
    if (!isYearMonth(month)) throw new Error(`invalid month: ${month}`);
    const { start, end, days } = monthPeriod(month);
    const count = [...recorded].filter((date) => date >= start && date <= end).length;
    const required = requiredRecordedDays(days);
    return { month, recorded: count, required, usable: count >= required };
  });
  const usableMonths = perMonth.filter((m) => m.usable).map((m) => m.month);
  const requiredMonths = requiredUsableMonths(months.length);
  return { ok: months.length > 0 && usableMonths.length >= requiredMonths, usableMonths, requiredMonths, missing: Math.max(0, requiredMonths - usableMonths.length), months: perMonth };
}

// 期間の開始日("2026-07-01")から、id を作る(四半期は "2026-Q3"、年は "2026")。月の 1 日でない・四半期の最初の月でない開始日は null
export function longTermIdOf(kind: LongTermKind, start: string): string | null {
  const match = /^(\d{4})-(\d{2})-01$/.exec(start);
  if (match === null) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  if (kind === "yearly") return month === 1 ? String(year) : null;
  return (month - 1) % 3 === 0 ? `${year}-Q${(month - 1) / 3 + 1}` : null;
}
