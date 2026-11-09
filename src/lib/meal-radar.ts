// 1 日の食事の栄養を、目標に対する割合(%)にする。レーダーチャートと、その横の表の元になる(AI は使わない)。
// 目標は一般的な参考値で、医療上の指示ではない。カロリーはプロフィールの目標に、その日の運動の消費を足した値。
// 目標カロリー(プロフィールの値)以外は、すべてこの値から割合で決める(性別・年齢・体重に左右されない)

// 三大栄養素は、エネルギー比の「幅」(ゾーン)で持つ。人によって適量が違うので、幅の中なら範囲内とする(利用者の決定、2026-11-06)。
// 幅は日本人の食事摂取基準のエネルギー比の目標量(たんぱく質 13〜20%・脂質 20〜30%・炭水化物 50〜65%)の記憶に基づく。年齢別の値は未確認。
// 輪の 100% と、表の「目標」の値は、幅の真ん中。たんぱく質は 1g = 4kcal、脂質は 9kcal、糖質は 4kcal
export const PROTEIN_ENERGY_RANGE = { low: 0.13, high: 0.2 } as const;
export const FAT_ENERGY_RANGE = { low: 0.2, high: 0.3 } as const;
export const CARB_ENERGY_RANGE = { low: 0.46, high: 0.69 } as const; // 国の目安(50〜65%)より少し広げた。他の軸と帯の幅をそろえ(真ん中 ±20%)、六角形を整えるため
export const KCAL_ZONE_PERCENT = { low: 90, high: 110 } as const; // カロリー: 目標の ±10%。±15% だと幅が 700kcal ほどになり、ゆるすぎた(食べすぎの日も「近い」と出る。利用者の判断、2026-11-06)
const mid = (range: { low: number; high: number }) => (range.low + range.high) / 2;
// 食物繊維: 真ん中(100%)は 20g、帯は 16〜24g。25g は現実の食事では高すぎる(日本人の実際の摂取量は 19g 台。令和元年の全国の平均)ので、実際の量に近い 20g を基準にした。国の目標量(2025 年版)の数字は未確認(利用者の決定、2026-11-06)
export const FIBER_RANGE_G = { low: 16, high: 24 } as const;
// 塩分(食塩相当量): 真ん中(100%)は 10g、帯は 8〜12g。国の目標(男性 7.5g・女性 6.5g 未満)は、現実の食事では厳しすぎるので、日本人の実際の摂取量(令和 5 年の 20 歳以上の平均は男性 10.7g・女性 9.1g、令和 6 年の全体は 9.6g)に近い 10g を基準にした。理想ではなく「いつもの量」を 100% にして、グラフが突き抜けて、やる気を下げないようにした(利用者の決定、2026-11-06)
export const SALT_RANGE_G = { low: 8, high: 12 } as const;
export const CHART_MAX_PERCENT = 200; // 描画は 200% で頭打ちにする(塩分が 3 倍でも、形がつぶれない)。ゾーンの上端(最大でも 121%)の外に、広い余白を取る(不規則な日は、150% にすぐ届くため。多い日も、実際の割合のまま描ける。圧縮はしない)。表は実際の値を出す

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
  zoneLow: number; // ゾーンの下端(100% = reference = ゾーンの真ん中に対する %)
  zoneHigh: number | null; // ゾーンの上端(%)。上が無い軸は null
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
    protein: targetKcal === null ? null : round1((targetKcal * mid(PROTEIN_ENERGY_RANGE)) / 4), // 運動の分は足さない(動いても、たんぱく質の目標は変えない)
    fat: allowanceKcal === null ? null : round1((allowanceKcal * mid(FAT_ENERGY_RANGE)) / 9),
    carb: allowanceKcal === null ? null : round1((allowanceKcal * mid(CARB_ENERGY_RANGE)) / 4),
    fiber: mid(FIBER_RANGE_G),
    salt: mid(SALT_RANGE_G),
  };
  // 幅の端を、真ん中(100%)に対する % にする
  const zoneOf = (range: { low: number; high: number }) => ({
    zoneLow: Math.round((range.low / mid(range)) * 100),
    zoneHigh: Math.round((range.high / mid(range)) * 100),
  });
  const defs: Omit<RadarAxis, "reference" | "percent" | "chartPercent">[] = [
    { key: "kcal", label: "カロリー", unit: "kcal", direction: "near", actual: sum((m) => m.kcal), zoneLow: KCAL_ZONE_PERCENT.low, zoneHigh: KCAL_ZONE_PERCENT.high },
    { key: "protein", label: "たんぱく質", unit: "g", direction: "reach", actual: sum((m) => num(m.proteinG)), ...zoneOf(PROTEIN_ENERGY_RANGE) },
    { key: "fat", label: "脂質", unit: "g", direction: "near", actual: sum((m) => num(m.fatG)), ...zoneOf(FAT_ENERGY_RANGE) },
    { key: "carb", label: "糖質", unit: "g", direction: "near", actual: sum((m) => num(m.netCarbG)), ...zoneOf(CARB_ENERGY_RANGE) },
    { key: "fiber", label: "食物繊維", unit: "g", direction: "reach", actual: sum((m) => num(m.fiberG)), ...zoneOf(FIBER_RANGE_G) },
    { key: "salt", label: "塩分", unit: "g", direction: "limit", actual: sum((m) => num(m.saltG)), ...zoneOf(SALT_RANGE_G) },
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

// 過ぎた日の一言(書きかけの日には使わない)。目標が無い軸は null。ゾーンの中なら範囲内
export function judgement(axis: RadarAxis): string | null {
  if (axis.percent === null) return null;
  const { percent, direction, zoneLow, zoneHigh } = axis;
  // 塩分は、日本人の平均が目標より多い(男性で約 10.7g)ので、少し超えただけで強く言わない
  if (direction === "limit") {
    const high = zoneHigh ?? 100;
    return percent <= high ? "目標の範囲内" : percent <= high + 30 ? "やや多め" : "多め";
  }
  // reach: 下端に届けばよい(ゾーンの上を超えても「多め」とは言わない)
  if (direction === "reach") return percent >= zoneLow ? "届いています" : percent >= zoneLow - 20 ? "あと少し" : "少なめ";
  return percent < zoneLow ? "少なめ" : zoneHigh !== null && percent > zoneHigh ? "多め" : "目標に近い";
}
