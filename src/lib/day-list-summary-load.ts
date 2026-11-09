import "server-only";
import { datesBetween, buildDayListSummary, type DayListSummary } from "@/lib/day-list-summary";
import { defaultMealDayAndTime } from "@/lib/meal-time";
import { loadTrendRaw } from "@/lib/trend-inputs";

// 一覧の 1 ページ分の日付(新しい日が先)の、食事と運動の要約を、まとめて 1 回ずつ取って作る(日ごとには問い合わせない)。ログイン中のユーザーの分だけ
export async function loadDayListSummary(rowDates: readonly string[]): Promise<Map<string, DayListSummary>> {
  if (rowDates.length === 0) return new Map();
  const first = rowDates[rowDates.length - 1];
  const last = rowDates[0];
  const raw = await loadTrendRaw({ from: first, intakeFrom: first, to: last });
  return buildDayListSummary(datesBetween(first, last), raw, defaultMealDayAndTime().date);
}
