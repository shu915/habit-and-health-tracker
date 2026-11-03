// 1 日の食事の栄養を、目標に対する割合(%)にする。レーダーチャートと、その横の表の元になる(AI は使わない)。
// 目標は一般的な参考値で、医療上の指示ではない。カロリーはプロフィールの目標に、その日の運動の消費を足した値。
// たんぱく質はプロフィールの目標、脂質・糖質はカロリーの目標から、塩分は下の定数から出す

export const FAT_ENERGY_RATIO = 0.25; // 脂質: 目標カロリーの 25%(1g = 9kcal)
export const CARB_ENERGY_RATIO = 0.5; // 糖質: 目標カロリーの 50%(1g = 4kcal)
// 塩分(食塩相当量)の目標: 男性 7.5g・女性 6.5g 未満。性別が未設定・その他は中間の 7.0g
export const SALT_LIMIT_G = { male: 7.5, female: 6.5, other: 7.0 } as const;
// 食物繊維の目標量(以上、日本人の食事摂取基準 2025 年版)。男性は 18〜29 歳 20g・30〜64 歳 22g・65〜74 歳 21g・75 歳以上 20g、
// 女性は 18〜74 歳 18g・75 歳以上 17g。年齢が未設定のときは、その性別の代表値(男性 21g・女性 18g)。性別が未設定・その他は中間の 19.5g
export const FIBER_GOAL_OTHER_G = 19.5;
export const CHART_MAX_PERCENT = 150; // 描画は 150% で頭打ちにする(塩分が 3 倍でも、形がつぶれない)。表は実際の値を出す

export type RadarMeal = {
  kcal: number;
  proteinG: string;
  fatG: string;
  netCarbG: string;
  fiberG: string | null;
  saltG: string | null;
};

export type RadarInput = {
  meals: readonly RadarMeal[];
  targetKcal: number | null; // プロフィールの目標カロリー
  exerciseKcal: number; // その日の追加の運動の消費。カロリーの目標に足す(動いた分は、多く食べてよい)
  targetProteinG: number | null;
  gender: string | null;
  age: number | null; // 食物繊維の目標を、年齢で出し分ける
};

// reach: 届いたほうがよい / near: 近いほどよい / limit: 超えないほうがよい
export type RadarDirection = "reach" | "near" | "limit";
export type RadarKey = "kcal" | "protein" | "fat" | "carb" | "fiber" | "salt";

export type RadarAxis = {
  key: RadarKey;
  label: string;
  unit: string;
  actual: number;
  reference: number | null; // 目標が出せないとき(目標カロリー未設定など)は null
  percent: number | null; // 実際の割合。目標が無ければ null
  chartPercent: number; // 描画用(0〜CHART_MAX_PERCENT。目標が無いときは 0)
  direction: RadarDirection;
};

export type MealRadar = {
  axes: RadarAxis[];
  baseKcal: number | null; // 目標カロリー(運動を足す前)
  exerciseKcal: number; // 目標に足した運動の分
  allowanceKcal: number | null; // カロリーの目標 = 目標カロリー + 運動の分。目標が未設定なら null
  incompleteFiber: boolean; // 食物繊維が分からない食事がある(合計が実際より少ない)
  incompleteSalt: boolean; // 塩分が分からない食事がある
};

const num = (value: string | null): number => (value === null ? 0 : Number(value));
const round1 = (value: number) => Math.round(value * 10) / 10;

export function fiberGoalG(gender: string | null, age: number | null): number {
  if (gender === "male") {
    if (age === null || age < 18) return 21;
    return age <= 29 ? 20 : age <= 64 ? 22 : age <= 74 ? 21 : 20;
  }
  if (gender === "female") return age !== null && age >= 75 ? 17 : 18;
  return FIBER_GOAL_OTHER_G;
}

export function saltLimitG(gender: string | null): number {
  return gender === "male" ? SALT_LIMIT_G.male : gender === "female" ? SALT_LIMIT_G.female : SALT_LIMIT_G.other;
}

export function mealRadar({ meals, targetKcal, exerciseKcal, targetProteinG, gender, age }: RadarInput): MealRadar {
  // その日のカロリーの目標: 目標カロリー + 運動の消費。脂質・糖質の目標も、この値から出す
  const allowanceKcal = targetKcal === null ? null : targetKcal + exerciseKcal;
  const sum = (pick: (meal: RadarMeal) => number) => round1(meals.reduce((total, meal) => total + pick(meal), 0));
  const references: Record<RadarKey, number | null> = {
    kcal: allowanceKcal,
    protein: targetProteinG,
    fat: allowanceKcal === null ? null : round1((allowanceKcal * FAT_ENERGY_RATIO) / 9),
    carb: allowanceKcal === null ? null : round1((allowanceKcal * CARB_ENERGY_RATIO) / 4),
    fiber: fiberGoalG(gender, age),
    salt: saltLimitG(gender),
  };
  const defs: { key: RadarKey; label: string; unit: string; direction: RadarDirection; actual: number }[] = [
    { key: "kcal", label: "カロリー", unit: "kcal", direction: "near", actual: sum((m) => m.kcal) },
    { key: "protein", label: "たんぱく質", unit: "g", direction: "reach", actual: sum((m) => num(m.proteinG)) },
    { key: "fat", label: "脂質", unit: "g", direction: "near", actual: sum((m) => num(m.fatG)) },
    { key: "carb", label: "糖質", unit: "g", direction: "near", actual: sum((m) => num(m.netCarbG)) },
    { key: "fiber", label: "食物繊維", unit: "g", direction: "reach", actual: sum((m) => num(m.fiberG)) },
    { key: "salt", label: "塩分", unit: "g", direction: "limit", actual: sum((m) => num(m.saltG)) },
  ];

  const axes = defs.map((def): RadarAxis => {
    const reference = references[def.key];
    const percent = reference === null || reference <= 0 ? null : Math.round((def.actual / reference) * 100);
    return { ...def, reference, percent, chartPercent: percent === null ? 0 : Math.min(percent, CHART_MAX_PERCENT) };
  });

  return {
    axes,
    baseKcal: targetKcal,
    exerciseKcal,
    allowanceKcal,
    incompleteFiber: meals.some((meal) => meal.fiberG === null),
    incompleteSalt: meals.some((meal) => meal.saltG === null),
  };
}

// 過ぎた日の一言(書きかけの日には使わない)。目標が無い軸は null
export function judgement(axis: RadarAxis): string | null {
  if (axis.percent === null) return null;
  const { percent, direction } = axis;
  // 塩分は、日本人の平均が目標より多い(男性で約 10.7g)ので、少し超えただけで強く言わない
  if (direction === "limit") return percent <= 100 ? "目標の範囲内" : percent <= 130 ? "やや多め" : "多め";
  if (direction === "reach") return percent >= 100 ? "届いています" : percent >= 80 ? "あと少し" : "少なめ";
  return percent < 90 ? "少なめ" : percent > 110 ? "多め" : "目標に近い";
}
