import { buildTrendViews, type TrendRaw } from "@/lib/trend-views";
import { shiftDate } from "@/lib/date";

// ダッシュボードの「日々の記録」の一覧に出す、日ごとの食事と運動の要約。
// 摂取・食事の回数・データ不足(sparse)は、推移のグラフと同じ入力・同じ関数(buildTrendViews)で出す(一覧とグラフと日の詳細で、判定が食い違わないため)。
// DB を読まない純粋な関数。読み込みは、day-list-summary-load.ts

export type DayListSummary = {
  intakeKcal: number | null; // その日の食事の合計。食事が無い日は null
  mealCount: number;
  sparse: boolean; // データ不足(過ぎた日で、食事が 1 回だけ、または摂取が目標の 6 割未満。lib/sparse-day.ts)
  exerciseMinutes: number; // その日の運動の合計(分)。無ければ 0
};

// 最初の日(first)から最後の日(last)まで、連続した日付(古い順)
export function datesBetween(first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= last; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

export function buildDayListSummary(dates: readonly string[], raw: TrendRaw, finishedBefore: string): Map<string, DayListSummary> {
  const views = buildTrendViews({ ...raw, dates: [...dates], finishedBefore });
  const minutes = new Map<string, number>();
  for (const exercise of raw.exercises) minutes.set(exercise.date, (minutes.get(exercise.date) ?? 0) + exercise.minutes);
  return new Map(
    views.calories.map((point) => [point.date, { intakeKcal: point.intake, mealCount: point.mealCount, sparse: point.sparse, exerciseMinutes: minutes.get(point.date) ?? 0 }]),
  );
}
