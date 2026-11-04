// 1 日の食事の栄養を、目標に対する割合(%)にする。レーダーチャートと、その横の表の元になる(AI は使わない)。
// 目標は一般的な参考値で、医療上の指示ではない。カロリーはプロフィールの目標に、その日の運動の消費を足した値。
// 目標カロリー(プロフィールの値)以外は、すべてこの値から割合で決める(性別・年齢・体重に左右されない)

export const PROTEIN_ENERGY_RATIO = 0.2; // たんぱく質: 目標カロリーの 20%(1g = 4kcal)。日本人の食事摂取基準のエネルギー比の目標量(13〜20% の上限側)に合わせた。2025 年版の年齢別の値は未確認
export const FAT_ENERGY_RATIO = 0.25; // 脂質: 目標カロリーの 25%(1g = 9kcal)
export const CARB_ENERGY_RATIO = 0.5; // 糖質: 目標カロリーの 50%(1g = 4kcal)
export const FIBER_GOAL_G = 20; // 食物繊維: 一律 20g 以上(2025 年版の目標量は男性 18〜22g・女性 17〜18g の範囲。その中ほど)
export const SALT_LIMIT_G = 7.5; // 塩分(食塩相当量): 一律 7.5g 未満(目標量は男性 7.5g・女性 6.5g。現実に届きやすいよう高いほうに合わせた)
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
  targetKcal: number | null; // プロフィールの目標カロリー(その日に固定した値)
  exerciseKcal: number; // その日の追加の運動の消費。カロリーの目標に足す(動いた分は、多く食べてよい)
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

export function mealRadar({ meals, targetKcal, exerciseKcal }: RadarInput): MealRadar {
  // その日のカロリーの目標: 目標カロリー + 運動の消費。脂質・糖質の目標も、この値から出す
  const allowanceKcal = targetKcal === null ? null : targetKcal + exerciseKcal;
  const sum = (pick: (meal: RadarMeal) => number) => round1(meals.reduce((total, meal) => total + pick(meal), 0));
  const references: Record<RadarKey, number | null> = {
    kcal: allowanceKcal,
    protein: targetKcal === null ? null : round1((targetKcal * PROTEIN_ENERGY_RATIO) / 4), // 運動の分は足さない(動いても、たんぱく質の目標は変えない)
    fat: allowanceKcal === null ? null : round1((allowanceKcal * FAT_ENERGY_RATIO) / 9),
    carb: allowanceKcal === null ? null : round1((allowanceKcal * CARB_ENERGY_RATIO) / 4),
    fiber: FIBER_GOAL_G,
    salt: SALT_LIMIT_G,
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
