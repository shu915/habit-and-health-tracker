// 運動の種類・強さと、消費カロリーの計算(AI は使わず、同じ入力なら同じ答えを出す純粋な関数)。
// 数字は一般的な目安(MET)で、医療上の指示ではない。種類の一覧と MET の表は管理人が決める定数で、
// 種類を足すときはここに 1 行足すだけ(DB の列は文字列で持ち、CHECK には種類の名前を書かない)。
// 一度使った種類は、記録が読めなくなるので、名前を変えず、消さない(やめるときは廃止の扱いにする)

// 保存する値(キー)と、画面に出す名前
export const EXERCISE_TYPES = [
  { key: "walk", label: "散歩(非定期)" },
  { key: "indoor", label: "室内エクササイズ" },
  { key: "strength", label: "筋トレ" },
  { key: "other", label: "その他" },
] as const;

export const EXERCISE_INTENSITIES = [
  { key: "light", label: "軽め" },
  { key: "normal", label: "普通" },
  { key: "hard", label: "ハード" },
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number]["key"];
export type ExerciseIntensity = (typeof EXERCISE_INTENSITIES)[number]["key"];

export const EXERCISE_TYPE_KEYS: readonly string[] = EXERCISE_TYPES.map((type) => type.key);
export const EXERCISE_INTENSITY_KEYS: readonly string[] = EXERCISE_INTENSITIES.map((intensity) => intensity.key);

// 種類 × 強さの MET(安静時を 1 とした運動の強さ)。仮の値で、使ってみて直す
export const MET: Record<ExerciseType, Record<ExerciseIntensity, number>> = {
  walk: { light: 2.8, normal: 3.5, hard: 5.0 },
  indoor: { light: 2.5, normal: 3.8, hard: 6.0 },
  strength: { light: 3.0, normal: 3.5, hard: 6.0 },
  other: { light: 3.0, normal: 4.0, hard: 6.0 },
};

// 保存されている文字列が、今の一覧にある種類か(型の絞り込み)
export function isExerciseType(value: string): value is ExerciseType {
  return EXERCISE_TYPE_KEYS.includes(value);
}
export function isExerciseIntensity(value: string): value is ExerciseIntensity {
  return EXERCISE_INTENSITY_KEYS.includes(value);
}

export function exerciseTypeLabel(key: string): string {
  return EXERCISE_TYPES.find((type) => type.key === key)?.label ?? key;
}
export function exerciseIntensityLabel(key: string): string {
  return EXERCISE_INTENSITIES.find((intensity) => intensity.key === key)?.label ?? key;
}

// 運動で増えた分の消費カロリー(kcal、整数)。(MET − 1) × 体重(kg) × 時間(h)。
// MET には安静にしている分(1 MET)が含まれ、それは基礎代謝として別に数えているので、1 を引く(重ねて数えない)。
// 体重が分からない、種類・強さが一覧にない、時間が 0 以下のときは null(計算できない)
export function exerciseKcal(type: string, intensity: string, minutes: number, weightKg: number | null): number | null {
  if (weightKg === null || !(weightKg > 0)) return null;
  if (!isExerciseType(type) || !isExerciseIntensity(intensity)) return null;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round((MET[type][intensity] - 1) * weightKg * (minutes / 60));
}
