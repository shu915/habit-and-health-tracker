// プロフィールの選択肢。フォーム・検証・表示で共通に使う

export const GENDER_OPTIONS = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
] as const;

// 活動係数(基礎代謝に掛ける係数)。DB には数値(numeric(4,3))で持つ。
// 選択肢の表示には、掛ける数字そのものを出す("1.375 軽い(週1〜3回の軽い運動)")。
// 1日の消費カロリー = 基礎代謝 × この数字 なので、数字が見えると目標カロリーの根拠が分かる
const ACTIVITY_LEVELS = [
  { value: "1.200", name: "座りがち", detail: "運動はほとんどしない" },
  { value: "1.375", name: "軽い", detail: "週1〜3回の軽い運動" },
  { value: "1.550", name: "ふつう", detail: "週3〜5回の運動" },
  { value: "1.725", name: "高い", detail: "週6〜7回の運動" },
  { value: "1.900", name: "非常に高い", detail: "肉体労働や毎日の激しい運動" },
] as const;

export const ACTIVITY_LEVEL_OPTIONS = ACTIVITY_LEVELS.map((level) => ({
  value: level.value,
  name: level.name,
  detail: level.detail,
  multiplier: String(Number(level.value)), // "1.375"(末尾の 0 を除く。1.200 → "1.2")
  label: `${Number(level.value)} ${level.name}(${level.detail})`, // 1 行の表示(テキストだけが必要な場所用)
}));

export function genderLabel(value: string | null): string | null {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function activityLevelLabel(value: string | null): string | null {
  if (value === null) return null;
  const option = ACTIVITY_LEVEL_OPTIONS.find((o) => Number(o.value) === Number(value));
  return option ? option.label : String(Number(value));
}

// 表示用に、名前・掛ける数字・説明に分ける。選択肢にない値(AI の提案など)は name が null
export function activityLevelParts(value: string | null) {
  if (value === null) return null;
  const option = ACTIVITY_LEVEL_OPTIONS.find((o) => Number(o.value) === Number(value));
  if (!option) return { name: null, multiplier: String(Number(value)), detail: null };
  return { name: option.name, multiplier: option.multiplier, detail: option.detail };
}
