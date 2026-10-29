// プロフィールの選択肢。フォーム・検証・表示で共通に使う

export const GENDER_OPTIONS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
] as const;

// 活動係数(基礎代謝に掛ける係数)。DB には数値(numeric(4,3))で持つ
export const ACTIVITY_LEVEL_OPTIONS = [
  { value: "1.200", label: "座りがち(運動はほとんどしない)" },
  { value: "1.375", label: "軽い(週1〜3回の軽い運動)" },
  { value: "1.550", label: "ふつう(週3〜5回の運動)" },
  { value: "1.725", label: "高い(週6〜7回の運動)" },
  { value: "1.900", label: "非常に高い(肉体労働や毎日の激しい運動)" },
] as const;

export function genderLabel(value: string | null): string | null {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function activityLevelLabel(value: string | null): string | null {
  if (value === null) return null;
  const option = ACTIVITY_LEVEL_OPTIONS.find((o) => Number(o.value) === Number(value));
  return option ? `${Number(value)}(${option.label})` : String(Number(value));
}
