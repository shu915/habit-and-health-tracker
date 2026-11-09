import { judgement, mealRadar, type RadarAxis, type RadarKey, type RadarMeal } from "@/lib/meal-radar";
import type { CalorieViewPoint } from "@/lib/trend-views";
import { median } from "@/lib/trend";

// レポートの「食事と栄養」に渡す、栄養素ごとの評価(DB を読まない純粋な関数)。数字の計算と判定は、コードでする(AI に足し算・判定をさせない)。
// 判定は、日の詳細のレーダーと同じ(lib/meal-radar.ts)。目標は一般的な参考値で、医療上の指示ではない。食事は AI の推定(約 1 割のずれ)
// 数えるのは、データがそろった日だけ(過ぎた日で、データ不足でなく、目標カロリーが決まっている日)。食物繊維・塩分は、分からない食事がある日を、その軸だけ外す

export type NutritionDay = {
  meals: readonly RadarMeal[];
  baseKcal: number | null; // 目標カロリー(その日に固定した値。運動を足す前)
  exerciseKcal: number;
  usable: boolean; // 過ぎた日で、データ不足でない
};

// 1 日の食事(栄養素の数字は、AI に渡す形の数値)と、その日のカロリーの点から、判定の入力にする
export type NutritionMeals = readonly { kcal: number; たんぱく質g: number; 脂質g: number; 糖質g: number; 食物繊維g: number | null; 塩分g: number | null }[];

export function nutritionDayOf(meals: NutritionMeals, point: CalorieViewPoint): NutritionDay {
  return {
    meals: meals.map((m) => ({
      kcal: m.kcal,
      proteinG: String(m.たんぱく質g),
      fatG: String(m.脂質g),
      netCarbG: String(m.糖質g),
      fiberG: m.食物繊維g === null ? null : String(m.食物繊維g),
      saltG: m.塩分g === null ? null : String(m.塩分g),
    })),
    baseKcal: point.target === null ? null : point.target - point.exerciseKcal,
    exerciseKcal: point.exerciseKcal,
    usable: !point.inProgress && !point.sparse,
  };
}

const AXES: { key: Exclude<RadarKey, "kcal">; name: string; reading: string }[] = [
  { key: "protein", name: "たんぱく質", reading: "少ない日が課題(多い日は問題なし)" },
  { key: "fat", name: "脂質", reading: "範囲から外れた日(多い日も少ない日も)が課題" },
  { key: "carb", name: "糖質", reading: "範囲から外れた日(多い日も少ない日も)が課題" },
  { key: "fiber", name: "食物繊維", reading: "少ない日が課題(多い日は問題なし)" },
  { key: "salt", name: "塩分", reading: "多い日が課題(少ない日は問題なし)" },
];

const round1 = (value: number) => Math.round(value * 10) / 10;

export function buildNutritionSummary(days: readonly NutritionDay[]): Record<string, unknown> | null {
  const radars = days.flatMap((day) => {
    if (!day.usable || day.baseKcal === null || day.meals.length === 0) return [];
    return [mealRadar({ meals: day.meals, targetKcal: day.baseKcal, exerciseKcal: day.exerciseKcal })];
  });
  if (radars.length === 0) return null;

  const nutrients = AXES.flatMap(({ key, name, reading }) => {
    // 軸ごとに、判定できる日だけ(目標が出る日。食物繊維・塩分は、分からない食事がある日を除く)
    const rows = radars.flatMap((radar) => {
      const axis = radar.axes.find((a) => a.key === key);
      if (!axis || axis.percent === null) return [];
      if (key === "fiber" && radar.incompleteFiber) return [];
      if (key === "salt" && radar.incompleteSalt) return [];
      return [axis];
    });
    if (rows.length === 0) return [];
    const below = rows.filter((a) => a.percent !== null && a.percent < a.zoneLow).length;
    const above = rows.filter((a) => a.percent !== null && a.zoneHigh !== null && a.percent > a.zoneHigh).length;
    const medianPercent = median(rows.map((a) => a.percent ?? 0)) ?? 0;
    const medianAmount = median(rows.map((a) => a.actual)) ?? 0;
    const template: RadarAxis = { ...rows[0], percent: Math.round(medianPercent) };
    return [
      {
        栄養素: name,
        単位: template.unit,
        判定した日数: rows.length,
        "1日の中央値": round1(medianAmount),
        目標に対する中央値の割合: Math.round(medianPercent),
        中央値の評価: judgement(template),
        目標の範囲内の日数: rows.length - below - above,
        少ない日数: below,
        多い日数: above,
        見方: reading,
      },
    ];
  });

  return { 判定した日数: radars.length, 栄養素: nutrients };
}
