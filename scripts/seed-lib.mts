// ダミーデータ(ダミーユーザー・デモ用の人物)を入れるときの、共通の部品。seed-dummy.mts と seed-demo.mts が使う。
// 乱数・日付・料理・1 日の計画の型・書き込み。接続先の確認(開発用 DB 以外には入れない)は、呼ぶ側のスクリプトでする。
// src/ のコードは import しない(Node がそのまま実行できるよう、別名の import を避ける)。列の名前は src/db/schema.ts と合わせる


// ---------- 小さな道具 ----------

export type Rng = () => number;

// 乱数の種を固定した、小さな乱数(mulberry32)
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const chance = (rng: Rng, probability: number) => rng() < probability;
export const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
// 正規分布のゆらぎ(Box-Muller)
export const noise = (rng: Rng, sd: number) => sd * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
export const round = (value: number, digits: number) => Number(value.toFixed(digits));
export const pad = (value: number) => String(value).padStart(2, "0");
// 0:00 からの分を "HH:MM" にする(24 時以降は 24〜26 時のまま。食事・運動の時刻用)
export const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(Math.floor(minutes % 60))}`;
// 睡眠の時刻は 0〜23 時
export const dayClock = (minutes: number) => clock(((Math.round(minutes) % 1440) + 1440) % 1440);

export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 日曜
// 前の月の最終日
export function lastDayOfPreviousMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

// ---------- 料理(品目の内訳つき。AI の推定の代わりに、固定の値を使う) ----------

export type Item = { name: string; amount: string; kcal: number; proteinG: number; fatG: number; carbohydrateG: number; fiberG: number | null; saltG: number | null };
export type Dish = { name: string; description: string; items: Item[] };

export const item = (name: string, amount: string, kcal: number, proteinG: number, fatG: number, carbohydrateG: number, fiberG: number | null, saltG: number | null): Item => ({
  name,
  amount,
  kcal,
  proteinG,
  fatG,
  carbohydrateG,
  fiberG,
  saltG,
});
export const dish = (name: string, description: string, ...items: Item[]): Dish => ({ name, description, items });

export const RICE = item("白ご飯", "茶碗1杯 150g", 252, 3.8, 0.5, 55.7, 0.5, 0);
export const MISO = item("味噌汁", "1杯", 40, 3, 1.5, 4, 1, 1.2);

export const BREAKFAST = [
  dish("納豆ご飯と味噌汁", "ご飯、納豆、味噌汁", RICE, item("納豆", "1パック 40g", 80, 6.6, 4, 5.4, 2.7, 0), MISO),
  dish("トーストと目玉焼き", "食パン、目玉焼き、コーヒー", item("食パン", "6枚切り1枚", 158, 5.6, 2.6, 28, 1.4, 0.8), item("目玉焼き", "卵1個", 95, 6.2, 7.2, 0.1, 0, 0.2), item("コーヒー", "1杯", 4, 0.2, 0, 0.7, 0, 0)),
  dish("ヨーグルトとバナナ", "プレーンヨーグルト、バナナ", item("プレーンヨーグルト", "100g", 62, 3.6, 3, 4.9, 0, 0.1), item("バナナ", "1本", 86, 1.1, 0.2, 22.5, 1.1, 0)),
  dish("オートミールと卵", "オートミール、牛乳、ゆで卵", item("オートミール", "40g", 152, 5.5, 2.8, 27.7, 3.8, 0), item("牛乳", "150ml", 101, 5, 5.7, 7.2, 0, 0.2), item("ゆで卵", "1個", 76, 6.2, 5.2, 0.2, 0, 0.2)),
] as const;

export const LUNCH_HEAVY = [
  dish("牛丼(並)", "牛丼の並", item("牛丼", "並 1杯", 635, 20, 22, 90, 2, 3.2)),
  dish("唐揚げ弁当", "唐揚げ弁当", item("白ご飯", "200g", 336, 5, 0.6, 74.3, 0.6, 0), item("鶏の唐揚げ", "4個", 300, 20, 19, 12, 0.4, 1.5), item("付け合わせ", "サラダと漬物", 40, 1, 2, 5, 1, 0.8)),
  dish("おにぎりとサラダチキン", "コンビニのおにぎり2個とサラダチキン", item("おにぎり", "2個", 360, 8, 3, 76, 1.2, 2), item("サラダチキン", "1個 115g", 120, 26, 1.5, 0.2, 0, 1.6)),
  dish("ざるそば", "ざるそば", item("ざるそば", "1枚", 340, 13, 2.5, 69, 3.5, 2.2)),
] as const;

export const LUNCH_LIGHT = [
  dish("鶏むね肉の定食", "ご飯、蒸し鶏、サラダ、味噌汁", RICE, item("蒸し鶏(むね)", "120g", 130, 28, 1.5, 0, 0, 0.5), item("サラダ", "80g", 40, 1.2, 2, 4, 1.5, 0.5), MISO),
  dish("豚汁定食", "ご飯、豚汁、小鉢", RICE, item("豚汁", "1杯", 120, 7, 6, 8, 2, 1.6), item("ひじきの煮物", "小鉢", 50, 2, 2, 7, 3, 0.7)),
  dish("ざるそば", "ざるそば", item("ざるそば", "1枚", 340, 13, 2.5, 69, 3.5, 2.2)),
] as const;

export const DINNER_LIGHT = [
  dish("焼き魚定食", "ご飯、焼き鮭、おひたし、味噌汁", RICE, item("焼き鮭", "1切れ 80g", 140, 18, 6.5, 0.1, 0, 1.3), item("ほうれん草のおひたし", "小鉢", 30, 3, 0.5, 3, 2, 0.6), MISO),
  dish("豚しゃぶサラダ", "豚しゃぶ、野菜、ご飯", item("豚しゃぶ(もも)", "150g", 230, 30, 11, 0.2, 0, 0.2), item("野菜サラダ", "150g", 40, 2, 0.3, 8, 3, 0.3), item("ごまだれ", "大さじ2", 80, 2, 7, 3, 0.5, 0.8), item("白ご飯", "120g", 202, 3, 0.4, 44.6, 0.4, 0)),
  dish("鶏と野菜の炒め物", "鶏肉と野菜の炒め物、ご飯", RICE, item("鶏と野菜の炒め物", "1人前", 280, 24, 14, 12, 3, 2)),
  dish("豆腐と鶏の鍋", "豆腐、鶏肉、野菜の鍋", item("鍋(豆腐・鶏・野菜)", "1人前", 320, 30, 12, 18, 5, 3.2)),
] as const;

export const NIGHT_BINGE = [
  dish("豚骨ラーメン", "豚骨ラーメン", item("ラーメン(豚骨)", "1杯", 850, 28, 32, 105, 4, 7.5)),
  dish("ポテトチップス", "ポテトチップス大袋", item("ポテトチップス", "1袋 90g", 500, 5, 31, 50, 4, 0.9)),
  dish("アイスとビール", "アイスクリームとビール", item("アイス", "1個", 250, 4, 12, 31, 0, 0.2), item("ビール", "500ml", 200, 1.5, 0, 15.5, 0, 0)),
  dish("カップ麺とおにぎり", "カップ麺とおにぎり", item("カップ麺", "1個", 450, 10, 19, 60, 3, 5.5), item("おにぎり", "1個", 180, 4, 1.5, 38, 0.6, 1)),
  dish("コンビニ弁当と唐揚げ", "幕の内弁当とコンビニの唐揚げ", item("幕の内弁当", "1個", 700, 24, 22, 100, 3, 4), item("からあげ", "5個", 350, 22, 22, 14, 0, 1.8)),
  dish("宅配ピザ", "宅配ピザとコーラ", item("ピザ", "4切れ", 900, 35, 36, 105, 4, 4.5), item("コーラ", "500ml", 225, 0, 0, 56, 0, 0)),
] as const;

export const SNACK = [
  dish("ナッツ", "ミックスナッツ", item("ミックスナッツ", "30g", 190, 6, 17, 6, 3, 0)),
  dish("プロテインバー", "プロテインバー", item("プロテインバー", "1本", 200, 15, 8, 16, 3, 0.3)),
  dish("菓子パン", "菓子パン", item("菓子パン", "1個", 380, 8, 15, 55, 1.5, 1)),
] as const;

export const ANY_DISH: readonly Dish[] = [...BREAKFAST, ...LUNCH_HEAVY, ...LUNCH_LIGHT, ...DINNER_LIGHT, ...NIGHT_BINGE, ...SNACK];

// 量を factor 倍にした料理(大盛り・おかわりなど)。栄養素は比例で増やし、量の目安に倍率を書く
export function scaled(base: Dish, factor: number): Dish {
  const mul = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    name: base.name,
    description: base.description,
    items: base.items.map((i) => ({
      ...i,
      amount: `${i.amount} ×${factor.toFixed(1)}`,
      kcal: Math.round(i.kcal * factor),
      proteinG: mul(i.proteinG),
      fatG: mul(i.fatG),
      carbohydrateG: mul(i.carbohydrateG),
      fiberG: i.fiberG === null ? null : mul(i.fiberG),
      saltG: i.saltG === null ? null : mul(i.saltG),
    })),
  };
}

// src/lib/meal-estimate.ts の totalsOf と同じ計算(合計はコードで出す)
export function totalsOf(items: readonly Item[]) {
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const known = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
  const fiber = known(items.map((i) => i.fiberG));
  const salt = known(items.map((i) => i.saltG));
  return {
    kcal: Math.round(sum(items.map((i) => i.kcal))),
    proteinG: round1(sum(items.map((i) => i.proteinG))),
    fatG: round1(sum(items.map((i) => i.fatG))),
    netCarbG: round1(sum(items.map((i) => Math.max(i.carbohydrateG - (i.fiberG ?? 0), 0)))),
    fiberG: fiber.length === 0 ? null : round1(sum(fiber)),
    saltG: salt.length === 0 ? null : round1(sum(salt)),
  };
}

// ---------- 1 日の計画 ----------

export type MealPlan = { time: string; dish: Dish };
export type ExercisePlan = { type: string; intensity: string; minutes: number; startTime: string | null; memo: string | null };
export type DayPlan = {
  weightKg: number | null;
  bodyFat: number | null;
  bedtime: string | null;
  wake: string | null;
  reflection: string | null;
  meals: MealPlan[];
  exercises: ExercisePlan[];
  positives: string[];
  // その日に固定するプロフィールの値(省略すると、プロフィールの値。長い期間で、活動係数や目標を変えたいとき用)
  stampActivityLevel?: string | null;
  stampTargetCalories?: number | null;
};
export const emptyDay = (): DayPlan => ({ weightKg: null, bodyFat: null, bedtime: null, wake: null, reflection: null, meals: [], exercises: [], positives: [] });

export type Context = { i: number; t: number; date: string; dow: number; rng: Rng };

export type Persona = {
  id: string;
  name: string;
  email: string;
  seed: number;
  profile: {
    gender: string | null;
    age: number | null;
    heightCm: number | null;
    currentWeightKg: number | null;
    currentBodyFatPercent: number | null;
    currentWaistCm: number | null;
    waistMeasuredOn: string | null;
    activityLevel: string | null;
    targetWeightKg: number | null;
    targetCalories: number | null;
    targetSleepMinutes: number;
    targetSleepMidpoint: string;
  };
  plan: (context: Context) => DayPlan | null; // null = その日は何も記録しない(days の行も作らない)
};


// ---------- 書き込み ----------

export type Counts = { days: number; meals: number; exercises: number; positives: number };

// 書き込みに使う接続の、必要な部分だけ(pg.Client が満たす。--dry-run では、何もしない見せかけの接続を渡せる)
export type Queryable = { query(text: string, values?: unknown[]): Promise<{ rows: { id: number }[] }> };

export async function seedPersona(client: Queryable, persona: Persona, options: { days: number; today: string }): Promise<Counts> {
  const counts: Counts = { days: 0, meals: 0, exercises: 0, positives: 0 };
  const rng = makeRng(persona.seed);
  const { days: DAYS, today } = options;
  const start = shift(today, -(DAYS - 1));

  await client.query("BEGIN");
  try {
    await client.query('INSERT INTO "user" (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [persona.id, persona.name, persona.email]);
    const p = persona.profile;
    await client.query(
      `INSERT INTO profiles (user_id, gender, age, height_cm, current_weight_kg, current_body_fat_percent, current_waist_cm, waist_measured_on, activity_level, target_weight_kg, target_calories, target_sleep_minutes, target_sleep_midpoint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [persona.id, p.gender, p.age, p.heightCm, p.currentWeightKg, p.currentBodyFatPercent, p.currentWaistCm, p.waistMeasuredOn, p.activityLevel, p.targetWeightKg, p.targetCalories, p.targetSleepMinutes, p.targetSleepMidpoint],
    );

    for (let i = 0; i < DAYS; i++) {
      const date = shift(start, i);
      const plan = persona.plan({ i, t: i / (DAYS - 1), date, dow: weekday(date), rng });
      if (plan === null) continue;

      const inserted = await client.query(
        `INSERT INTO days (user_id, date, morning_weight_kg, morning_body_fat_percent, sleep_bedtime, sleep_wake_time, reflection, profile_target_calories, profile_activity_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [persona.id, date, plan.weightKg, plan.bodyFat, plan.bedtime, plan.wake, plan.reflection, plan.stampTargetCalories ?? p.targetCalories, plan.stampActivityLevel ?? p.activityLevel],
      );
      const dayId = inserted.rows[0].id;
      counts.days++;

      for (const meal of plan.meals) {
        const totals = totalsOf(meal.dish.items);
        await client.query(
          `INSERT INTO meals (user_id, day_id, eaten_time, dish_name, description, kcal, protein_g, fat_g, net_carb_g, fiber_g, salt_g, items)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
          [persona.id, dayId, meal.time, meal.dish.name, meal.dish.description, totals.kcal, totals.proteinG, totals.fatG, totals.netCarbG, totals.fiberG, totals.saltG, JSON.stringify(meal.dish.items)],
        );
        counts.meals++;
      }
      for (const exercise of plan.exercises) {
        await client.query("INSERT INTO exercises (user_id, day_id, type, intensity, minutes, start_time, memo) VALUES ($1, $2, $3, $4, $5, $6, $7)", [persona.id, dayId, exercise.type, exercise.intensity, exercise.minutes, exercise.startTime, exercise.memo]);
        counts.exercises++;
      }
      for (const [index, body] of plan.positives.entries()) {
        await client.query("INSERT INTO positive_entries (user_id, day_id, position, body) VALUES ($1, $2, $3, $4)", [persona.id, dayId, index + 1, body]);
        counts.positives++;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return counts;
}
