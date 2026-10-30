import {
  basalMetabolicRate,
  bmi,
  CALORIE_DEFICIT_RATE,
  dailyEnergy,
  MIN_CALORIES,
  PROTEIN_G_PER_KG,
  standardWeightKg,
  suggestTargetCalories,
  suggestTargetProtein,
  suggestTargetWeight,
  WEIGHT_LOSS_RATE,
  OVERWEIGHT_BMI,
  type BmrMethod,
  type BodyData,
} from "@/lib/nutrition";
import { PROFILE_LIMITS, type LimitedField } from "@/lib/profile-limits";
import { ACTIVITY_LEVEL_OPTIONS, GENDER_OPTIONS } from "@/lib/profile-options";
import type { ProfileField } from "@/lib/profile-schema";

// プロフィールのフォームに今入力されている値(文字列)から、目標値の提案と、消費カロリーの目安を作る。
// 保存はしない(提案はフォームの入力欄を埋めるだけで、本人が確認して直し、保存する)。
// フォームの値は途中の状態かもしれないので、読めない値は「未入力」として扱う(エラーにはしない)

export type FormValues = Partial<Record<ProfileField, string>>;

// 提案できる項目。この順に計算する(あとの項目は、前の項目の結果を使う)
export const SUGGESTABLE_FIELDS = ["targetWeightKg", "targetCalories", "targetProteinG"] as const;
export type SuggestableField = (typeof SUGGESTABLE_FIELDS)[number];

// 10 進数の数字だけを数値にする。読めなければ null(未入力として扱う)
function toNumber(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : null;
}

// 現実的な範囲(profile-limits.ts の app)の外の値は、入力ミスや入力の途中とみなして、未入力として扱う。
// (身長 0 や体脂肪率 150% のまま計算して、変な提案や負の基礎代謝を出さないため)
function toBounded(value: string | undefined, field: LimitedField): number | null {
  const number = toNumber(value);
  if (number === null) return null;
  const { min, max } = PROFILE_LIMITS[field].app;
  return number >= min && number <= max ? number : null;
}

function toActivityLevel(value: string | undefined): number | null {
  const number = toNumber(value);
  if (number === null) return null;
  return ACTIVITY_LEVEL_OPTIONS.some((option) => Number(option.value) === number) ? number : null;
}

function readBody(values: FormValues): BodyData {
  const gender = GENDER_OPTIONS.find((option) => option.value === values.gender)?.value ?? null;
  return {
    gender,
    age: toBounded(values.age, "age"),
    heightCm: toBounded(values.heightCm, "heightCm"),
    weightKg: toBounded(values.currentWeightKg, "currentWeightKg"),
    bodyFatPercent: toBounded(values.currentBodyFatPercent, "currentBodyFatPercent"),
  };
}

export type EnergySummary =
  | { ok: true; bmrKcal: number; method: BmrMethod; tdeeKcal: number | null; activityLevel: number | null }
  | { ok: false; missing: string[] };

// 基礎代謝と、1 日の消費カロリーの目安(活動係数が選ばれていれば)。フォームに表示する
export function energySummary(values: FormValues): EnergySummary {
  const bmr = basalMetabolicRate(readBody(values));
  if (!bmr.ok) return { ok: false, missing: bmr.missing };

  const activityLevel = toActivityLevel(values.activityLevel);
  return {
    ok: true,
    bmrKcal: bmr.kcal,
    method: bmr.method,
    activityLevel,
    tdeeKcal: activityLevel === null ? null : dailyEnergy(bmr.kcal, activityLevel),
  };
}

export type SuggestResult = {
  values: Partial<Record<SuggestableField, string>>; // 入力欄に入れる値
  notes: Partial<Record<SuggestableField, string>>; // 何を根拠にした値か(欄の下に表示する)
  errors: Partial<Record<SuggestableField, string>>; // 材料が足りなくて提案できない理由
};

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

// 目標値の提案は、大人の基準(BMI 25 以上は減らす、消費の 15% 減など)で作るので、18 歳以上だけを対象にする。
// 成長期の人に、減量や減カロリーを提案しない
export const MIN_SUGGEST_AGE = 18;

export function suggestTargets(values: FormValues, selected: readonly SuggestableField[]): SuggestResult {
  const result: SuggestResult = { values: {}, notes: {}, errors: {} };
  const body = readBody(values);
  const wants = (field: SuggestableField) => selected.includes(field);

  // --- 年齢の確認(18 歳以上だけ。年齢が空・範囲外の入力でも提案しない) ---
  if (body.age === null || body.age < MIN_SUGGEST_AGE) {
    const reason =
      body.age === null
        ? `目標値の提案には、年齢（${MIN_SUGGEST_AGE} 歳以上）の入力が必要です。`
        : `目標値の提案は ${MIN_SUGGEST_AGE} 歳以上の方が対象です。成長期の減量や食事の目安は、医師や専門家に相談してください。`;
    for (const field of selected) result.errors[field] = reason;
    return result;
  }

  // --- 目標体重 ---
  // 入力済みの目標体重が範囲外のときは、空とは別に扱う(「空なので仮定」と表示して誤解させない)
  const targetWeightEntered = (values.targetWeightKg ?? "").trim() !== "";
  let targetWeightKg: number | null = toBounded(values.targetWeightKg, "targetWeightKg");
  const targetWeightInvalid = targetWeightEntered && targetWeightKg === null;
  let targetWeightAssumed = false; // 目標体重が空なので、提案の値を仮定して使ったか

  const suggestedWeight =
    body.weightKg !== null && body.heightCm !== null ? suggestTargetWeight(body.weightKg, body.heightCm) : null;

  if (wants("targetWeightKg")) {
    if (!suggestedWeight || body.weightKg === null || body.heightCm === null) {
      result.errors.targetWeightKg = "目標体重の提案には、現在の体重と身長が必要です。";
    } else {
      const value = bmi(body.weightKg, body.heightCm);
      result.values.targetWeightKg = String(suggestedWeight.kg);
      result.notes.targetWeightKg =
        suggestedWeight.reason === "reduce"
          ? `現在の体重 ${body.weightKg}kg の ${percent(WEIGHT_LOSS_RATE)} 減（BMI ${value.toFixed(1)}）。参考: 標準体重（BMI 22）は約 ${Math.round(standardWeightKg(body.heightCm))}kg`
          : `BMI ${value.toFixed(1)} が ${OVERWEIGHT_BMI} 未満なので、現在の体重を維持`;
      targetWeightKg = suggestedWeight.kg;
    }
  } else if (targetWeightKg === null && suggestedWeight && !targetWeightInvalid) {
    // 目標体重が空のまま、カロリーやタンパク質だけ提案するときは、同じ方針の目標体重を仮定する
    targetWeightKg = suggestedWeight.kg;
    targetWeightAssumed = true;
  }

  const assumption = targetWeightAssumed ? `（目標体重が空なので、${targetWeightKg}kg を仮定）` : "";

  // --- 目標カロリー ---
  if (wants("targetCalories")) {
    const bmr = basalMetabolicRate(body);
    const activityLevel = toActivityLevel(values.activityLevel);

    if (targetWeightInvalid) {
      result.errors.targetCalories = `目標体重の値（${(values.targetWeightKg ?? "").trim()}）は使えません。${PROFILE_LIMITS.targetWeightKg.app.min}〜${PROFILE_LIMITS.targetWeightKg.app.max}kg の数字に直すか、空にしてから提案してください。`;
    } else if (!bmr.ok) {
      result.errors.targetCalories = `目標カロリーの提案には、基礎代謝の計算に必要な項目（${bmr.missing.join("・")}）の入力が必要です。`;
    } else if (activityLevel === null) {
      result.errors.targetCalories = "目標カロリーの提案には、活動係数を選ぶ必要があります。";
    } else if (targetWeightKg === null || body.weightKg === null) {
      result.errors.targetCalories = "目標カロリーの提案には、現在の体重と身長（または目標体重）が必要です。";
    } else {
      const tdeeKcal = dailyEnergy(bmr.kcal, activityLevel);
      const calories = suggestTargetCalories({ bmrKcal: bmr.kcal, tdeeKcal, weightKg: body.weightKg, targetWeightKg });
      const basis = `消費 ${tdeeKcal} kcal（基礎代謝 ${bmr.kcal} × ${activityLevel}）`;
      const reason = {
        maintain: `${basis}と同じ（体重を維持）`,
        deficit: `${basis}から ${percent(CALORIE_DEFICIT_RATE)} 減`,
        "floor-bmr": `${basis}から ${percent(CALORIE_DEFICIT_RATE)} 減だと基礎代謝を下回るため、基礎代謝に合わせています`,
        "floor-min": `${basis}から ${percent(CALORIE_DEFICIT_RATE)} 減だと下限を下回るため、${MIN_CALORIES} kcal に合わせています`,
      }[calories.reason];
      result.values.targetCalories = String(calories.kcal);
      result.notes.targetCalories = `${reason}${assumption}`;
    }
  }

  // --- 目標タンパク質 ---
  if (wants("targetProteinG")) {
    if (targetWeightInvalid) {
      result.errors.targetProteinG = `目標体重の値（${(values.targetWeightKg ?? "").trim()}）は使えません。${PROFILE_LIMITS.targetWeightKg.app.min}〜${PROFILE_LIMITS.targetWeightKg.app.max}kg の数字に直すか、空にしてから提案してください。`;
    } else if (targetWeightKg === null) {
      result.errors.targetProteinG = "目標タンパク質の提案には、目標体重（または現在の体重と身長）が必要です。";
    } else {
      result.values.targetProteinG = String(suggestTargetProtein(targetWeightKg));
      result.notes.targetProteinG = `目標体重 ${targetWeightKg}kg × ${PROTEIN_G_PER_KG} g/kg${assumption}`;
    }
  }

  return result;
}
