// プロフィールの値の範囲。項目ごとに、2 種類の範囲を 1 か所に書く。
//
//   app: 現実的な範囲。zod の検証とフォームの範囲表示が使う(外れたら、利用者に分かりやすいエラーを返す)
//   db:  DB の CHECK 制約(src/db/schema.ts)が止める範囲。「絶対にあり得ない値」だけを止める広い範囲
//
// 決まり: app は db の内側にあること(外側だと、検証を通った値が DB に拒否されてエラー画面になる)。
// テストで 2 つを確かめる。profile-limits.test.ts(app が db の内側)と、data-access.test.ts(定数が実際の DB と一致)。
// DB の CHECK の SQL は、マイグレーションを増やさないため定数から生成せず、schema.ts に直接書いてある。
// db の範囲を変えるときは、定数・schema.ts・マイグレーションの 3 つを一緒に直す(テストが食い違いを検出する)

export type Bound = {
  min: number;
  max: number;
  minExclusive?: boolean; // true なら min を含まない(min より大きい)
  maxExclusive?: boolean; // true なら max を含まない(max より小さい)
};

type Limit = {
  scale: number; // 小数の桁数(列の scale。整数は 0)
  app: Bound;
  db: Bound;
};

export type LimitedField =
  | "age"
  | "heightCm"
  | "currentWeightKg"
  | "currentBodyFatPercent"
  | "currentWaistCm"
  | "activityLevel"
  | "targetWeightKg"
  | "targetCalories"
  | "targetProteinG"
  | "targetSleepMinutes";

export const PROFILE_LIMITS: Record<LimitedField, Limit> = {
  age: { scale: 0, app: { min: 5, max: 120 }, db: { min: 0, max: 150 } },
  heightCm: { scale: 1, app: { min: 50, max: 250 }, db: { min: 0, max: 300, minExclusive: true } },
  currentWeightKg: {
    scale: 2,
    app: { min: 20, max: 300 },
    db: { min: 0, max: 500, minExclusive: true, maxExclusive: true },
  },
  // 体脂肪率(%)。app は現実的な範囲(体重計が出す値)、db は 0 より大きく 100 未満
  currentBodyFatPercent: {
    scale: 1,
    app: { min: 3, max: 60 },
    db: { min: 0, max: 100, minExclusive: true, maxExclusive: true },
  },
  currentWaistCm: { scale: 1, app: { min: 30, max: 250 }, db: { min: 0, max: 300, minExclusive: true } },
  // 活動係数は選択式(profile-options.ts の 5 つ)。app は選択肢の最小〜最大
  activityLevel: { scale: 3, app: { min: 1.2, max: 1.9 }, db: { min: 1, max: 3 } },
  targetWeightKg: {
    scale: 2,
    app: { min: 20, max: 300 },
    db: { min: 0, max: 500, minExclusive: true, maxExclusive: true },
  },
  targetCalories: { scale: 0, app: { min: 500, max: 10000 }, db: { min: 0, max: 10000, minExclusive: true } },
  targetProteinG: { scale: 1, app: { min: 0, max: 500 }, db: { min: 0, max: 1000 } },
  targetSleepMinutes: { scale: 0, app: { min: 120, max: 1080 }, db: { min: 0, max: 1440, minExclusive: true } },
};

// フォームに出す範囲の文字列("5〜120")
export function formatRange(field: LimitedField): string {
  const { min, max } = PROFILE_LIMITS[field].app;
  return `${min}〜${max}`;
}

// inner の範囲が outer の範囲の内側にあるか(両端が除外かどうかも考える)
export function isWithin(inner: Bound, outer: Bound): boolean {
  const lowerOk = inner.min > outer.min || (inner.min === outer.min && (!!outer.minExclusive ? !!inner.minExclusive : true));
  const upperOk = inner.max < outer.max || (inner.max === outer.max && (!!outer.maxExclusive ? !!inner.maxExclusive : true));
  return lowerOk && upperOk;
}
