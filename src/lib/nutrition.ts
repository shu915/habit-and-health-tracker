// 基礎代謝・消費カロリー・目標値の計算(AI は使わず、同じ入力なら同じ答えを出す純粋な関数)。
// ここの数字は一般的な目安で、医療上の指示ではない。精度は±10〜15% 程度。
// 係数は定数にまとめてあるので、方針を変えるときはここだけを直す

export type BodyData = {
  gender: string | null; // "male" | "female" | "other"
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPercent: number | null; // 体重計が出す測定値。無ければ null
};

// --- 方針の定数 ---
export const WEIGHT_LOSS_RATE = 0.05; // 目標体重: BMI 25 以上のとき、現在の体重の 5% 減を最初の目標にする
export const OVERWEIGHT_BMI = 25; // 日本の基準で肥満(1度)とされる BMI
export const STANDARD_BMI = 22; // 標準体重の BMI(参考として表示する)
export const CALORIE_DEFICIT_RATE = 0.15; // 目標カロリー: 体重を減らすとき、消費カロリーから 15% 減
export const MIN_CALORIES = 1200; // 目標カロリーの絶対的な下限(基礎代謝がこれより低い人のため)
export const PROTEIN_G_PER_KG = 1.4; // 目標タンパク質: 目標体重 1kg あたり

export type BmrMethod = "katch-mcardle" | "mifflin-st-jeor";
export type BmrResult =
  | { ok: true; kcal: number; method: BmrMethod }
  | { ok: false; missing: string[] };

// 基礎代謝(何もしなくても使う 1 日のカロリー)。
//  - 体脂肪率があれば Katch-McArdle 式(除脂肪体重から出す。体重と体脂肪率だけで足りる)
//  - 無ければ Mifflin-St Jeor 式(体重・身長・年齢・性別)。性別が「その他」のときは男女の中間の定数を使う
export function basalMetabolicRate(body: BodyData): BmrResult {
  const { gender, age, heightCm, weightKg, bodyFatPercent } = body;

  if (weightKg === null) return { ok: false, missing: ["体重"] };

  if (bodyFatPercent !== null) {
    const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
    return { ok: true, kcal: Math.round(370 + 21.6 * leanMassKg), method: "katch-mcardle" };
  }

  const missing: string[] = [];
  if (heightCm === null) missing.push("身長");
  if (age === null) missing.push("年齢");
  if (gender === null) missing.push("性別");
  if (missing.length > 0 || heightCm === null || age === null || gender === null) return { ok: false, missing };

  const constant = gender === "male" ? 5 : gender === "female" ? -161 : (5 + -161) / 2;
  return {
    ok: true,
    kcal: Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + constant),
    method: "mifflin-st-jeor",
  };
}

// 1 日の消費カロリー = 基礎代謝 × 活動係数
export function dailyEnergy(bmrKcal: number, activityLevel: number): number {
  return Math.round(bmrKcal * activityLevel);
}

export function bmi(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

// 標準体重(BMI 22 になる体重)
export function standardWeightKg(heightCm: number): number {
  const meters = heightCm / 100;
  return meters * meters * STANDARD_BMI;
}

const roundTo = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export type TargetWeight = { kg: number; reason: "reduce" | "maintain" };

// 目標体重。BMI 25 未満なら現在の体重を維持、25 以上なら現在の 5% 減を最初の目標にする。
// (BMI 25 の人を 5% 減らしても BMI 23.75 で標準体重の 22 より高いので、「標準体重を下回らない」ための下限は要らない)
export function suggestTargetWeight(weightKg: number, heightCm: number): TargetWeight {
  if (bmi(weightKg, heightCm) < OVERWEIGHT_BMI) return { kg: roundTo(weightKg, 1), reason: "maintain" };
  return { kg: roundTo(weightKg * (1 - WEIGHT_LOSS_RATE), 1), reason: "reduce" };
}

export type TargetCalories = {
  kcal: number;
  reason: "maintain" | "deficit" | "floor-bmr" | "floor-min"; // 維持 / 15% 減 / 基礎代謝を下回らないよう引き上げ / 絶対的な下限
};

// 目標カロリー(1 日に食べる量)。目標体重が現在以上なら消費と同じ(維持)、減らすなら 15% 減。
// 基礎代謝と絶対的な下限(1200 kcal)を下回らない。10 kcal 単位に丸める
export function suggestTargetCalories(input: {
  bmrKcal: number;
  tdeeKcal: number;
  weightKg: number;
  targetWeightKg: number;
}): TargetCalories {
  const { bmrKcal, tdeeKcal, weightKg, targetWeightKg } = input;
  const round10 = (value: number) => Math.round(value / 10) * 10;
  const ceil10 = (value: number) => Math.ceil(value / 10) * 10; // 下限は切り上げる(四捨五入だと、基礎代謝を数 kcal 下回ることがある)

  if (targetWeightKg >= weightKg) return { kcal: round10(tdeeKcal), reason: "maintain" };

  const deficit = round10(tdeeKcal * (1 - CALORIE_DEFICIT_RATE));
  const floor = Math.max(bmrKcal, MIN_CALORIES);
  if (deficit < floor) {
    return { kcal: ceil10(floor), reason: bmrKcal >= MIN_CALORIES ? "floor-bmr" : "floor-min" };
  }
  return { kcal: deficit, reason: "deficit" };
}

// 目標タンパク質(g)。目標体重 1kg あたり 1.4g。整数に丸める
export function suggestTargetProtein(targetWeightKg: number): number {
  return Math.round(targetWeightKg * PROTEIN_G_PER_KG);
}
