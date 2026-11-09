import { isSparseDay } from "@/lib/sparse-day";
import { buildCalorieTrend, latestBefore, type CalorieDayPoint } from "@/lib/calorie-trend";
import { buildSleepTrend, buildTrend, valuesByDate, type SleepPoint, type TrendPoint } from "@/lib/trend";

// 推移のグラフ(体重・体脂肪率・睡眠・カロリー)の「元の数字」から、各図の点を作る、DB を読まない純粋な関数。
// ダッシュボード(trend-section.tsx)と、レポート(lib/reports.ts のスナップショット)が、同じ入力・同じ関数を使う
// (レポートは、作った時点の入力を JSON で保存し、開くたびにここから点を作り直す。移動平均のような計算で出る値は、保存しない)

export type TrendDayRow = {
  date: string;
  morningWeightKg: string | null;
  morningBodyFatPercent: string | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  profileTargetCalories: number | null;
  profileActivityLevel: string | null;
};

export type TrendProfile = {
  targetCalories: number | null;
  currentWeightKg: string | null;
  currentBodyFatPercent: string | null;
  gender: string | null;
  age: number | null;
  heightCm: string | null;
  activityLevel: string | null;
  targetSleepMidpoint: string | null; // 睡眠のバッジの判定に使う(プロフィールの睡眠の目標)
};

// DB から取ったままの入力(期間の日付は含まない)
export type TrendRaw = {
  rows: TrendDayRow[]; // 期間(と、移動平均の窓の分)の日の行
  intake: { date: string; kcal: number; mealCount: number }[]; // 食事のある日の、摂取 kcal の合計と食事の回数
  exercises: { date: string; type: string; intensity: string; minutes: number }[];
  weightBeforeFrom: { weight: string; date: string } | null; // 窓の最初の日より前の、いちばん新しい朝の体重(取った行の中に無いときの補い)
  bodyFatBeforeFrom: { weight: string; date: string } | null;
  targetBeforeFrom: number | null; // 同じく、固定した目標カロリー
  profile: TrendProfile;
};

export type TrendInputs = TrendRaw & {
  dates: string[]; // 表示する日付(古い順)
  finishedBefore: string; // この日より前の日は「過ぎた日」(それ以降は書きかけで、薄く描く・中央値に数えない)
};

// sparse: データが不足している日(過ぎた日で、食事の記録が 1 回だけ、または摂取が目標の 6 割未満。lib/sparse-day.ts)。中央値・差の合計・体重の換算から外す
export type CalorieViewPoint = CalorieDayPoint & { inProgress: boolean; mealCount: number; sparse: boolean };

export type TrendViews = {
  weight: TrendPoint[];
  bodyFat: TrendPoint[];
  sleep: SleepPoint[];
  calories: CalorieViewPoint[];
};

export function buildTrendViews(inputs: TrendInputs): TrendViews {
  const { dates, rows, profile } = inputs;
  const isFinishedDay = (date: string) => date < inputs.finishedBefore;
  const weight = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningWeightKg }))), 2);
  const bodyFat = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningBodyFatPercent }))), 1);
  // 期間の最初の日より前の、いちばん新しい朝の体重・体脂肪率と固定した目標(取った記録の中を先に見て、無ければ、さらに前の分。latestBefore)
  const priorMorningWeight = latestBefore(rows, dates[0], (d) => (d.morningWeightKg === null ? null : { weight: d.morningWeightKg, date: d.date }), inputs.weightBeforeFrom);
  const priorMorningBodyFat = latestBefore(rows, dates[0], (d) => (d.morningBodyFatPercent === null ? null : { weight: d.morningBodyFatPercent, date: d.date }), inputs.bodyFatBeforeFrom);
  const priorStampedTargetKcal = latestBefore(rows, dates[0], (d) => d.profileTargetCalories, inputs.targetBeforeFrom);
  const mealCounts = new Map(inputs.intake.map((d) => [d.date, d.mealCount]));
  const calories = buildCalorieTrend(dates, {
    rows: rows.map((d) => ({ date: d.date, morningWeightKg: d.morningWeightKg, stampedTargetKcal: d.profileTargetCalories, morningBodyFatPercent: d.morningBodyFatPercent, stampedActivityLevel: d.profileActivityLevel })),
    intake: new Map(inputs.intake.map((d) => [d.date, d.kcal])),
    exercises: inputs.exercises,
    priorMorningWeight,
    priorStampedTargetKcal,
    profileTargetKcal: profile.targetCalories,
    isFinishedDay,
    profileWeightKg: profile.currentWeightKg,
    energy: {
      gender: profile.gender,
      age: profile.age,
      heightCm: profile.heightCm,
      profileBodyFatPercent: profile.currentBodyFatPercent,
      profileActivityLevel: profile.activityLevel,
      priorMorningBodyFat,
    },
  }).map((point) => {
    const inProgress = !isFinishedDay(point.date);
    const mealCount = mealCounts.get(point.date) ?? 0;
    return { ...point, inProgress, mealCount, sparse: !inProgress && isSparseDay({ mealCount, intakeKcal: point.intake, targetKcal: point.target }) };
  });
  const sleep = buildSleepTrend(dates, new Map(rows.map((d) => [d.date, { bedtime: d.sleepBedtime, wakeTime: d.sleepWakeTime }])));
  return { weight, bodyFat, sleep, calories };
}
