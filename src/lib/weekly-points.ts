import { shiftDate } from "@/lib/date";
import { median } from "@/lib/trend";
import { buildTrendViews, type TrendInputs } from "@/lib/trend-views";

// 長期レポートのグラフ用に、日ごとの値を、週ごと(月曜始まり)にまとめる(DB を読まない純粋な関数。AI は使わない)。
// 1 週間 = 1 本(日足・週足・月足の「週足」)。四半期で約 13 点、年で約 52 点。保存した日ごとの数字(スナップショット)から描き直す。
// 線は、その週の中央値。薄い帯は、その週の最小から最大(ばらつき)。記録が少ない週(minRecorded 日に満たない)は、点を出さない(線を途切れさせる)

export type WeekPoint = {
  weekStart: string; // 月曜日
  label: string; // "7/6"(横軸の目盛りと、ホバーの見出し)
  recorded: number; // その週に、値のある日数
  median: number | null;
  low: number | null;
  high: number | null;
};

const mondayOf = (date: string): string => {
  const day = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 月曜 0 … 日曜 6
  return shiftDate(date, -day);
};
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// 期間(first〜last)を覆う週の月曜日を、古い順に
function weekStarts(first: string, last: string): string[] {
  const starts: string[] = [];
  for (let start = mondayOf(first); start <= last; start = shiftDate(start, 7)) starts.push(start);
  return starts;
}

export function weeklyFromDaily(daily: readonly { date: string; value: number | null }[], range: { first: string; last: string }, options: { minRecorded: number; digits?: number }): WeekPoint[] {
  const digits = options.digits ?? 2;
  const round = (value: number) => Math.round(value * 10 ** digits) / 10 ** digits;
  const byWeek = new Map<string, number[]>();
  for (const { date, value } of daily) {
    if (value === null || date < range.first || date > range.last) continue;
    const key = mondayOf(date);
    byWeek.set(key, [...(byWeek.get(key) ?? []), value]);
  }
  return weekStarts(range.first, range.last).map((weekStart) => {
    const values = byWeek.get(weekStart) ?? [];
    const enough = values.length >= options.minRecorded && values.length > 0;
    return {
      weekStart,
      label: shortDate(weekStart),
      recorded: values.length,
      median: enough ? round(median(values) ?? 0) : null,
      low: enough ? round(Math.min(...values)) : null,
      high: enough ? round(Math.max(...values)) : null,
    };
  });
}

// 週ごとの、運動した日数(0〜7)。運動は「いつもより多く動いた分」だけの記録なので、0 日の週も、そのまま 0 として出す
export type WeekCount = { weekStart: string; label: string; days: number };

export function weeklyDayCounts(dates: readonly string[], range: { first: string; last: string }): WeekCount[] {
  const unique = new Set(dates.filter((d) => d >= range.first && d <= range.last));
  return weekStarts(range.first, range.last).map((weekStart) => ({
    weekStart,
    label: shortDate(weekStart),
    days: Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)).filter((d) => unique.has(d)).length,
  }));
}

// 長期レポートのグラフに使う、週ごとの系列を、保存した日ごとの数字から作る
export type LongTermWeekly = {
  sleepMinutes: WeekPoint[];
  weightKg: WeekPoint[];
  bodyFatPercent: WeekPoint[];
  intakeKcal: WeekPoint[]; // データがそろった日だけ(過ぎた日で、データ不足でない)
  targetKcal: WeekPoint[];
  exerciseDays: WeekCount[];
};

export function longTermWeekly(snapshot: TrendInputs): LongTermWeekly {
  const views = buildTrendViews(snapshot);
  const range = { first: snapshot.dates[0], last: snapshot.dates[snapshot.dates.length - 1] };
  return {
    sleepMinutes: weeklyFromDaily(views.sleep.map((p) => ({ date: p.date, value: p.minutes })), range, { minRecorded: 3, digits: 0 }),
    weightKg: weeklyFromDaily(views.weight.map((p) => ({ date: p.date, value: p.value })), range, { minRecorded: 2, digits: 2 }),
    bodyFatPercent: weeklyFromDaily(views.bodyFat.map((p) => ({ date: p.date, value: p.value })), range, { minRecorded: 2, digits: 1 }),
    intakeKcal: weeklyFromDaily(views.calories.map((p) => ({ date: p.date, value: p.inProgress || p.sparse ? null : p.intake })), range, { minRecorded: 3, digits: 0 }),
    targetKcal: weeklyFromDaily(views.calories.map((p) => ({ date: p.date, value: p.target })), range, { minRecorded: 1, digits: 0 }),
    exerciseDays: weeklyDayCounts(snapshot.exercises.map((e) => e.date), range),
  };
}
