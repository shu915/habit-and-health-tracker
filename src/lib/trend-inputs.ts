import "server-only";
import { getMorningBodyFatBefore, getMorningWeightBefore, getStampedTargetBefore, listDayMeasures } from "@/lib/days";
import { listExercisesInRange } from "@/lib/exercises";
import { listDailyIntake } from "@/lib/meals";
import { getProfile } from "@/lib/profiles";
import type { TrendRaw } from "@/lib/trend-views";

// 推移のグラフの元の数字を、期間ぶんまとめて 1 回ずつ取る(日ごとには問い合わせない)。ログイン中のユーザーの分だけ(各関数が user_id で絞る)。
// from: 日の行を取り始める日(移動平均の窓の分、表示の最初の日より前から)/ intakeFrom: 食事と運動を取り始める日(表示の最初の日)/ to: 取る最後の日
export async function loadTrendRaw({ from, intakeFrom, to }: { from: string; intakeFrom: string; to: string }): Promise<TrendRaw> {
  const [rows, intake, exercises, weightBeforeFrom, bodyFatBeforeFrom, targetBeforeFrom, profile] = await Promise.all([
    listDayMeasures(from, to),
    listDailyIntake(intakeFrom, to),
    listExercisesInRange(intakeFrom, to),
    getMorningWeightBefore(from),
    getMorningBodyFatBefore(from),
    getStampedTargetBefore(from),
    getProfile(),
  ]);
  return {
    rows,
    intake,
    exercises,
    weightBeforeFrom,
    bodyFatBeforeFrom,
    targetBeforeFrom,
    profile: {
      targetCalories: profile.targetCalories,
      currentWeightKg: profile.currentWeightKg,
      currentBodyFatPercent: profile.currentBodyFatPercent,
      gender: profile.gender,
      age: profile.age,
      heightCm: profile.heightCm,
      activityLevel: profile.activityLevel,
      targetSleepMidpoint: profile.targetSleepMidpoint,
    },
  };
}
