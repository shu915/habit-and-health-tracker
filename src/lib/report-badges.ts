import { isSparseDay, SPARSE_MIN_MEALS } from "@/lib/sparse-day";
import { nightOffset, type SleepPoint } from "@/lib/trend";

// レポートのバッジ(docs/ai-feedback.md)。**生活習慣(睡眠・食事・運動)が整っているか**を、数字の範囲で測り、整っていれば贈る。
// 「継続(record)」だけは、成果ではなく、記録を続けたこと(その日に何か 1 種類でも記録した日の割合)に贈る(2026-11-10、利用者の決定。出席のバッジ。記録を続ければ、誰でも取れる)。
// 評価(成績・点数)はつけない。悪い結果は出さず、取れたバッジだけを返す。コードが条件で決める(AI の印象ではない)。DB は読まない。
// 体重のバッジは作らない(体重を減らしたことには贈らない方針で、範囲にすると、範囲の外の人がずっと取れないため)。条件の数字は一般的な目安で、医療上の指示ではない
// 並びは、画面の並び(継続が先頭。ほぼ全員が取れる土台のバッジ)
export const BADGE_KEYS = ["record", "sleep", "calorie", "exercise"] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];
export const BADGE_LABELS: Record<BadgeKey, string> = { record: "継続", sleep: "睡眠", calorie: "カロリー", exercise: "運動" };

export const BADGE_TIERS = ["bronze", "silver", "gold"] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];
export const BADGE_TIER_LABELS: Record<BadgeTier, string> = { bronze: "ブロンズ", silver: "シルバー", gold: "ゴールド" };

// 収まった割合(判定できた日のうち)の基準。仮の数字で、実際の人のデータで、取れすぎ・取れなさすぎを見て直す
export const TIER_RATIOS: Record<BadgeTier, number> = { bronze: 0.5, silver: 0.7, gold: 0.9 };
// 判定できた日が、期間の日数のこの割合に届かないときは、その項目のバッジは出さない(たまたまの結果を、バッジにしない)
export const MIN_JUDGED_RATIO = 0.5;

// 睡眠: 睡眠時間が 6 時間以上(厚生労働省「健康づくりのための睡眠ガイド 2023」の成人の目安)、かつ、
// 睡眠の中間時刻が、プロフィールの目標の中間時刻の ±1 時間以内。時刻の線引きは公的な根拠が無いので、時計の時刻を決めつけず、利用者自身の目標に合わせる
export const SLEEP_MIN_MINUTES = 6 * 60;
export const SLEEP_MIDPOINT_TOLERANCE_MINUTES = 60;
// カロリー: 摂取が、目標となるカロリーの 85%〜115%(下限が「極端に食べない」日、上限が暴飲暴食を外す)。食事が 1 回だけの日(記録が不完全な可能性)は判定から外す
export const CALORIE_LOW_RATIO = 0.85;
export const CALORIE_HIGH_RATIO = 1.15;
export const CALORIE_MIN_MEALS = SPARSE_MIN_MEALS; // データ不足の判定(lib/sparse-day.ts)と同じ。食事が 1 回だけの日、摂取が目標の 6 割未満の日は、判定から外す
// 運動: 「いつもより多く動いた」運動の記録がある日が、その週(7 日)に 1 日以上ある

export type Badge = { key: BadgeKey; tier: BadgeTier; passed: number; judged: number; unit: "day" | "week" };

export function tierOf(ratio: number): BadgeTier | null {
  if (ratio >= TIER_RATIOS.gold) return "gold";
  if (ratio >= TIER_RATIOS.silver) return "silver";
  if (ratio >= TIER_RATIOS.bronze) return "bronze";
  return null;
}

function toBadge(key: BadgeKey, unit: Badge["unit"], passed: number, judged: number, periodDays: number): Badge | null {
  const judgedDays = unit === "day" ? judged : judged * 7;
  if (judged === 0 || judgedDays < periodDays * MIN_JUDGED_RATIO) return null;
  const tier = tierOf(passed / judged);
  return tier === null ? null : { key, tier, passed, judged, unit };
}

// 睡眠のバッジ。targetMidpoint: プロフィールの目標の中間時刻("HH:MM")。無ければ、睡眠時間だけで判定する
export function sleepBadge(points: readonly SleepPoint[], targetMidpoint: string | null, periodDays: number): Badge | null {
  const target = targetMidpoint === null ? null : nightOffset(targetMidpoint);
  const judged = points.filter((p) => p.minutes !== null);
  const passed = judged.filter((p) => (p.minutes ?? 0) >= SLEEP_MIN_MINUTES && (target === null || (p.midpoint !== null && Math.abs(p.midpoint - target) <= SLEEP_MIDPOINT_TOLERANCE_MINUTES)));
  return toBadge("sleep", "day", passed.length, judged.length, periodDays);
}

export type CalorieDay = { date: string; intake: number | null; target: number | null; mealCount: number; inProgress: boolean };

export function calorieBadge(days: readonly CalorieDay[], periodDays: number): Badge | null {
  const judged = days.filter((d) => !d.inProgress && d.intake !== null && d.target !== null && d.target > 0 && !isSparseDay({ mealCount: d.mealCount, intakeKcal: d.intake, targetKcal: d.target }));
  const passed = judged.filter((d) => {
    const ratio = (d.intake ?? 0) / (d.target ?? 1);
    return ratio >= CALORIE_LOW_RATIO && ratio <= CALORIE_HIGH_RATIO;
  });
  return toBadge("calorie", "day", passed.length, judged.length, periodDays);
}

// 運動のバッジ。dates: 期間の日付(古い順)、exerciseDates: 運動の記録がある日。期間の最初の日から 7 日ずつの週に分け、満たない端の日は判定しない
export function exerciseBadge(dates: readonly string[], exerciseDates: Iterable<string>, periodDays: number): Badge | null {
  const exercised = new Set(exerciseDates);
  const weeks = Math.floor(dates.length / 7);
  let passed = 0;
  for (let week = 0; week < weeks; week++) {
    if (dates.slice(week * 7, week * 7 + 7).some((date) => exercised.has(date))) passed += 1;
  }
  return toBadge("exercise", "week", passed, weeks, periodDays);
}

// 継続のバッジ。dates: 期間の日付、recordedDates: その日に何か 1 種類でも記録がある日(朝の記録・食事・運動・良かったこと・今日の気づきのどれか)
export function recordBadge(dates: readonly string[], recordedDates: Iterable<string>, periodDays: number): Badge | null {
  const recorded = new Set(recordedDates);
  return toBadge("record", "day", dates.filter((date) => recorded.has(date)).length, dates.length, periodDays);
}

export function computeBadges(input: Record<BadgeKey, Badge | null>): Badge[] {
  return BADGE_KEYS.flatMap((key) => (input[key] ? [input[key]] : []));
}
