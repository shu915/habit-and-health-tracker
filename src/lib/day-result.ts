import { defaultMealDayAndTime } from "@/lib/meal-time";
import type { EnergyOverview } from "@/lib/energy-overview";
import { exerciseKcal } from "@/lib/exercise";

// 過ぎた日の「結果」(摂取と消費の目安、その差)の計算。AI は使わず、保存もしない(表示のたびに、記録から計算する)。
// 数字は推定どうしの比べ(目安)で、医療上の指示ではない

// 結果を出す日か: 「今の食事の日」より前の日だけ。今日(03:00 までは前日)と未来は、まだ記録が増えるので出さない。
// 「今」は、食事の追加画面の初期値と同じ規則(defaultMealDayAndTime)で決める。
// サーバーの時計で判定する(デプロイ先が UTC だと、日本の利用者には最大 9 時間遅れて出る。早く出ることはない)
export function isFinishedDay(date: string, now: Date = new Date()): boolean {
  return date < defaultMealDayAndTime(now).date;
}

export type DayResultInput = {
  meals: { kcal: number; proteinG: string }[];
  exercises: { type: string; intensity: string; minutes: number }[];
  weightKg: number | null; // 運動の消費の計算に使う体重(その日の朝の体重、無ければプロフィールの体重)
  energy: EnergyOverview;
  targetProteinG: number | null;
  targetCalories: number | null; // プロフィールの目標カロリー
};

export type DayResult = {
  mealCount: number;
  intakeKcal: number;
  proteinG: number;
  targetProteinG: number | null;
  // 目標となるカロリー = 目標カロリー + その日の追加の運動の消費(動いた分は、多く食べてよい)。目標が未設定なら null。
  // 消費の目安(現実の推定)とは別のもの: 目標は計画なので、消費とずれていてよい(そのずれが、減量のペース)
  target: { baseKcal: number; exerciseKcal: number; totalKcal: number } | null;
  // 消費の目安。プロフィールが足りないとき(基礎代謝や活動係数が出せない)は null
  burn: { tdeeKcal: number; exerciseKcal: number; totalKcal: number; exerciseUncalculated: boolean } | null;
  // 摂取 − 消費。食事の記録が無い日と、消費が出せない日は null(記録が無い日を、大きな赤字に見せない)
  diffKcal: number | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function dayResult(input: DayResultInput): DayResult {
  const intakeKcal = input.meals.reduce((total, meal) => total + meal.kcal, 0);
  const proteinG = round1(input.meals.reduce((total, meal) => total + Number(meal.proteinG), 0));

  const kcals = input.exercises.map((exercise) => exerciseKcal(exercise.type, exercise.intensity, exercise.minutes, input.weightKg));
  const exercise = kcals.reduce<number>((total, kcal) => total + (kcal ?? 0), 0);
  let burn: DayResult["burn"] = null;
  if (input.energy.kind === "ready") {
    burn = {
      tdeeKcal: input.energy.tdeeKcal,
      exerciseKcal: exercise,
      totalKcal: input.energy.tdeeKcal + exercise,
      exerciseUncalculated: kcals.some((kcal) => kcal === null),
    };
  }

  return {
    mealCount: input.meals.length,
    intakeKcal,
    proteinG,
    targetProteinG: input.targetProteinG,
    target:
      input.targetCalories === null
        ? null
        : { baseKcal: input.targetCalories, exerciseKcal: exercise, totalKcal: input.targetCalories + exercise },
    burn,
    diffKcal: input.meals.length === 0 || burn === null ? null : intakeKcal - burn.totalKcal,
  };
}

