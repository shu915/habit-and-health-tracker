// 開発用のダミーデータを入れる。3 人のダミーユーザーに、100 日分の記録を作る(AI は呼ばない)。
//   node scripts/seed-dummy.mts            ダミーユーザーを消して、入れ直す
//   node scripts/seed-dummy.mts --delete   ダミーユーザーだけを消す
// 入れるのは開発用 DB(localhost:5433 の habit_health。docker compose の DB)だけ。それ以外の接続先では、何もせずに止まる。
// 同じ日に実行すれば、同じデータができる(乱数の種を固定している)。ダミーユーザーの id は "dummy-" で始まる。
// ログインは、ダミーユーザーのメールでマジックリンクを送る(リンクは next dev の端末に出る)。
// ALLOWED_EMAILS を設定しているときは、ダミーのメールもそこに足すこと。
// src/ のコードは import しない(Node がそのまま実行できるよう、別名の import を避ける)。列の名前は src/db/schema.ts と合わせる

import pg from "pg";

const DAYS = 100;
const DUMMY_PREFIX = "dummy-";

// ---------- 接続先の確認(開発用 DB 以外には入れない) ----------

// URL を自分で解釈しない: pg はクエリ文字列(?host=...)を URL の host より優先するので、自前の解釈だと食い違う。
// pg.Client が実際に使う host と database を、接続する前に確かめる(host が取れないときも止める)
const connectionString = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/habit_health";
const client = new pg.Client({ connectionString });
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(client.host ?? "") || client.port !== 5433 || client.database !== "habit_health") {
  throw new Error(`開発用 DB(localhost:5433 の habit_health)以外には入れません: ${client.host ?? "(host なし)"}:${client.port}/${client.database ?? "(DB 名なし)"}`);
}

// ---------- 小さな道具 ----------

type Rng = () => number;

// 乱数の種を固定した、小さな乱数(mulberry32)
function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chance = (rng: Rng, probability: number) => rng() < probability;
const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
// 正規分布のゆらぎ(Box-Muller)
const noise = (rng: Rng, sd: number) => sd * Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const round = (value: number, digits: number) => Number(value.toFixed(digits));
const pad = (value: number) => String(value).padStart(2, "0");
// 0:00 からの分を "HH:MM" にする(24 時以降は 24〜26 時のまま。食事・運動の時刻用)
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(Math.floor(minutes % 60))}`;
// 睡眠の時刻は 0〜23 時
const dayClock = (minutes: number) => clock(((Math.round(minutes) % 1440) + 1440) % 1440);

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 日曜
// 前の月の最終日
function lastDayOfPreviousMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

// ---------- 料理(品目の内訳つき。AI の推定の代わりに、固定の値を使う) ----------

type Item = { name: string; amount: string; kcal: number; proteinG: number; fatG: number; carbohydrateG: number; fiberG: number | null; saltG: number | null };
type Dish = { name: string; description: string; items: Item[] };

const item = (name: string, amount: string, kcal: number, proteinG: number, fatG: number, carbohydrateG: number, fiberG: number | null, saltG: number | null): Item => ({
  name,
  amount,
  kcal,
  proteinG,
  fatG,
  carbohydrateG,
  fiberG,
  saltG,
});
const dish = (name: string, description: string, ...items: Item[]): Dish => ({ name, description, items });

const RICE = item("白ご飯", "茶碗1杯 150g", 252, 3.8, 0.5, 55.7, 0.5, 0);
const MISO = item("味噌汁", "1杯", 40, 3, 1.5, 4, 1, 1.2);

const BREAKFAST = [
  dish("納豆ご飯と味噌汁", "ご飯、納豆、味噌汁", RICE, item("納豆", "1パック 40g", 80, 6.6, 4, 5.4, 2.7, 0), MISO),
  dish("トーストと目玉焼き", "食パン、目玉焼き、コーヒー", item("食パン", "6枚切り1枚", 158, 5.6, 2.6, 28, 1.4, 0.8), item("目玉焼き", "卵1個", 95, 6.2, 7.2, 0.1, 0, 0.2), item("コーヒー", "1杯", 4, 0.2, 0, 0.7, 0, 0)),
  dish("ヨーグルトとバナナ", "プレーンヨーグルト、バナナ", item("プレーンヨーグルト", "100g", 62, 3.6, 3, 4.9, 0, 0.1), item("バナナ", "1本", 86, 1.1, 0.2, 22.5, 1.1, 0)),
  dish("オートミールと卵", "オートミール、牛乳、ゆで卵", item("オートミール", "40g", 152, 5.5, 2.8, 27.7, 3.8, 0), item("牛乳", "150ml", 101, 5, 5.7, 7.2, 0, 0.2), item("ゆで卵", "1個", 76, 6.2, 5.2, 0.2, 0, 0.2)),
] as const;

const LUNCH_HEAVY = [
  dish("牛丼(並)", "牛丼の並", item("牛丼", "並 1杯", 635, 20, 22, 90, 2, 3.2)),
  dish("唐揚げ弁当", "唐揚げ弁当", item("白ご飯", "200g", 336, 5, 0.6, 74.3, 0.6, 0), item("鶏の唐揚げ", "4個", 300, 20, 19, 12, 0.4, 1.5), item("付け合わせ", "サラダと漬物", 40, 1, 2, 5, 1, 0.8)),
  dish("おにぎりとサラダチキン", "コンビニのおにぎり2個とサラダチキン", item("おにぎり", "2個", 360, 8, 3, 76, 1.2, 2), item("サラダチキン", "1個 115g", 120, 26, 1.5, 0.2, 0, 1.6)),
  dish("ざるそば", "ざるそば", item("ざるそば", "1枚", 340, 13, 2.5, 69, 3.5, 2.2)),
] as const;

const LUNCH_LIGHT = [
  dish("鶏むね肉の定食", "ご飯、蒸し鶏、サラダ、味噌汁", RICE, item("蒸し鶏(むね)", "120g", 130, 28, 1.5, 0, 0, 0.5), item("サラダ", "80g", 40, 1.2, 2, 4, 1.5, 0.5), MISO),
  dish("豚汁定食", "ご飯、豚汁、小鉢", RICE, item("豚汁", "1杯", 120, 7, 6, 8, 2, 1.6), item("ひじきの煮物", "小鉢", 50, 2, 2, 7, 3, 0.7)),
  dish("ざるそば", "ざるそば", item("ざるそば", "1枚", 340, 13, 2.5, 69, 3.5, 2.2)),
] as const;

const DINNER_LIGHT = [
  dish("焼き魚定食", "ご飯、焼き鮭、おひたし、味噌汁", RICE, item("焼き鮭", "1切れ 80g", 140, 18, 6.5, 0.1, 0, 1.3), item("ほうれん草のおひたし", "小鉢", 30, 3, 0.5, 3, 2, 0.6), MISO),
  dish("豚しゃぶサラダ", "豚しゃぶ、野菜、ご飯", item("豚しゃぶ(もも)", "150g", 230, 30, 11, 0.2, 0, 0.2), item("野菜サラダ", "150g", 40, 2, 0.3, 8, 3, 0.3), item("ごまだれ", "大さじ2", 80, 2, 7, 3, 0.5, 0.8), item("白ご飯", "120g", 202, 3, 0.4, 44.6, 0.4, 0)),
  dish("鶏と野菜の炒め物", "鶏肉と野菜の炒め物、ご飯", RICE, item("鶏と野菜の炒め物", "1人前", 280, 24, 14, 12, 3, 2)),
  dish("豆腐と鶏の鍋", "豆腐、鶏肉、野菜の鍋", item("鍋(豆腐・鶏・野菜)", "1人前", 320, 30, 12, 18, 5, 3.2)),
] as const;

const NIGHT_BINGE = [
  dish("豚骨ラーメン", "豚骨ラーメン", item("ラーメン(豚骨)", "1杯", 850, 28, 32, 105, 4, 7.5)),
  dish("ポテトチップス", "ポテトチップス大袋", item("ポテトチップス", "1袋 90g", 500, 5, 31, 50, 4, 0.9)),
  dish("アイスとビール", "アイスクリームとビール", item("アイス", "1個", 250, 4, 12, 31, 0, 0.2), item("ビール", "500ml", 200, 1.5, 0, 15.5, 0, 0)),
  dish("カップ麺とおにぎり", "カップ麺とおにぎり", item("カップ麺", "1個", 450, 10, 19, 60, 3, 5.5), item("おにぎり", "1個", 180, 4, 1.5, 38, 0.6, 1)),
  dish("コンビニ弁当と唐揚げ", "幕の内弁当とコンビニの唐揚げ", item("幕の内弁当", "1個", 700, 24, 22, 100, 3, 4), item("からあげ", "5個", 350, 22, 22, 14, 0, 1.8)),
  dish("宅配ピザ", "宅配ピザとコーラ", item("ピザ", "4切れ", 900, 35, 36, 105, 4, 4.5), item("コーラ", "500ml", 225, 0, 0, 56, 0, 0)),
] as const;

const SNACK = [
  dish("ナッツ", "ミックスナッツ", item("ミックスナッツ", "30g", 190, 6, 17, 6, 3, 0)),
  dish("プロテインバー", "プロテインバー", item("プロテインバー", "1本", 200, 15, 8, 16, 3, 0.3)),
  dish("菓子パン", "菓子パン", item("菓子パン", "1個", 380, 8, 15, 55, 1.5, 1)),
] as const;

const ANY_DISH: readonly Dish[] = [...BREAKFAST, ...LUNCH_HEAVY, ...LUNCH_LIGHT, ...DINNER_LIGHT, ...NIGHT_BINGE, ...SNACK];

// 量を factor 倍にした料理(大盛り・おかわりなど)。栄養素は比例で増やし、量の目安に倍率を書く
function scaled(base: Dish, factor: number): Dish {
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
function totalsOf(items: readonly Item[]) {
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

type MealPlan = { time: string; dish: Dish };
type ExercisePlan = { type: string; intensity: string; minutes: number; startTime: string | null; memo: string | null };
type DayPlan = {
  weightKg: number | null;
  bodyFat: number | null;
  bedtime: string | null;
  wake: string | null;
  reflection: string | null;
  meals: MealPlan[];
  exercises: ExercisePlan[];
  positives: string[];
};
const emptyDay = (): DayPlan => ({ weightKg: null, bodyFat: null, bedtime: null, wake: null, reflection: null, meals: [], exercises: [], positives: [] });

type Context = { i: number; t: number; date: string; dow: number; rng: Rng };

type Persona = {
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
    targetProteinG: number | null;
    targetSleepMinutes: number;
    targetSleepMidpoint: string;
  };
  plan: (context: Context) => DayPlan | null; // null = その日は何も記録しない(days の行も作らない)
};

const today = todayString();
const lastMonthEnd = lastDayOfPreviousMonth(today);
const threeMonthsAgo = shift(today, -95);

// --- 1. 昔の崩れた俺: 昼は普通、夜中にどか食い。寝るのが遅く、体重と体脂肪率がじわじわ上がる ---
const COLLAPSED_REFLECTIONS = [
  "また夜中に食べてしまった。寝るのが遅くて、朝がつらい。",
  "昼は普通に食べたのに、夜にラーメンを我慢できなかった。",
  "体重が増えている。分かっているのに、やめられない。",
  "仕事が忙しくて、食事が夜に偏った。",
  "今日は夜食を半分にできた。少しだけ前進。",
];
const COLLAPSED_POSITIVES = ["久しぶりに散歩した。気分が軽くなった", "同僚が声をかけてくれた。ほっとした", "朝日を見られた。早起きできてよかった"];

function collapsed({ t, dow, rng }: Context): DayPlan | null {
  if (chance(rng, 0.03)) return null;
  const day = emptyDay();
  const weekend = dow === 0 || dow === 6;
  if (chance(rng, 0.92)) day.weightKg = round(78 + 5 * t + (weekend ? 0.4 : 0) + noise(rng, 0.45), 2);
  if (day.weightKg !== null && chance(rng, 0.95)) day.bodyFat = round(24 + 3.5 * t + noise(rng, 0.4), 1);
  if (chance(rng, 0.9)) {
    const bed = between(rng, 90, 270) + (weekend ? 60 : 0); // 就寝は午前 1:30〜4:30(週末はさらに遅い)
    day.bedtime = dayClock(bed);
    day.wake = dayClock(bed + between(rng, 5, 7) * 60);
  }
  if (chance(rng, 0.15)) day.meals.push({ time: clock(between(rng, 570, 660)), dish: BREAKFAST[1] });
  if (chance(rng, 0.95)) day.meals.push({ time: clock(between(rng, 750, 870)), dish: scaled(pick(rng, LUNCH_HEAVY), between(rng, 1, 1.3)) });
  if (chance(rng, 0.7)) day.meals.push({ time: clock(between(rng, 1050, 1170)), dish: scaled(pick(rng, [LUNCH_HEAVY[0], LUNCH_HEAVY[1], LUNCH_HEAVY[2]]), between(rng, 1, 1.2)) });
  if (chance(rng, 0.7 + 0.25 * t)) {
    day.meals.push({ time: clock(between(rng, 1350, 1560)), dish: scaled(pick(rng, NIGHT_BINGE), between(rng, 1, 1.5)) }); // 22:30〜26:00
    if (chance(rng, 0.7)) day.meals.push({ time: clock(between(rng, 1500, 1610)), dish: scaled(pick(rng, NIGHT_BINGE), between(rng, 1, 1.5)) }); // 25:00〜26:50
  }
  if (chance(rng, 0.08)) day.exercises.push({ type: "walk", intensity: pick(rng, ["light", "normal"]), minutes: Math.round(between(rng, 20, 40)), startTime: clock(1200), memo: null });
  if (chance(rng, 0.55)) day.reflection = pick(rng, COLLAPSED_REFLECTIONS);
  if (chance(rng, 0.12)) day.positives.push(pick(rng, COLLAPSED_POSITIVES));
  return day;
}

// --- 2. 優等生: 規則正しい睡眠と食事、運動、日記。体重はゆっくり下がる ---
const MODEL_REFLECTIONS = ["予定どおりに過ごせた。夜はぐっすり眠れた。", "筋トレの重さを少し増やせた。", "野菜を多めに食べて、体が軽い。", "早めに寝る準備ができた。"];
const MODEL_POSITIVES = [
  "朝の空気が澄んでいた。深呼吸したら頭がすっきりした",
  "ジムで前より重いものを持てた。続けてきた努力が報われた",
  "夕食のスープがおいしかった。丁寧に作ってよかった",
  "友人から嬉しいメッセージが届いた。つながりを感じられた",
  "時間どおりに仕事が終わった。段取りがうまくいった",
];

function model({ t, dow, rng }: Context): DayPlan | null {
  const day = emptyDay();
  day.weightKg = round(56 - 1.5 * t + noise(rng, 0.25), 2);
  day.bodyFat = round(24 - 1.5 * t + noise(rng, 0.3), 1);
  const bed = between(rng, 1350, 1410); // 22:30〜23:30
  day.bedtime = dayClock(bed);
  day.wake = dayClock(bed + between(rng, 7, 8) * 60);
  day.meals.push({ time: clock(between(rng, 420, 460)), dish: scaled(pick(rng, BREAKFAST), between(rng, 1.2, 1.5)) });
  day.meals.push({ time: clock(between(rng, 720, 760)), dish: scaled(pick(rng, LUNCH_LIGHT), between(rng, 1.3, 1.6)) });
  day.meals.push({ time: clock(between(rng, 1110, 1180)), dish: scaled(pick(rng, DINNER_LIGHT), between(rng, 1.3, 1.6)) });
  if (chance(rng, 0.3)) day.meals.push({ time: clock(between(rng, 900, 940)), dish: pick(rng, [SNACK[0], SNACK[1]]) });
  if (dow === 1 || dow === 3 || dow === 5 || dow === 6) {
    day.exercises.push({ type: "strength", intensity: "normal", minutes: Math.round(between(rng, 45, 60)), startTime: clock(1020), memo: chance(rng, 0.3) ? "脚の日" : null });
  } else if (chance(rng, 0.5)) {
    day.exercises.push({ type: "walk", intensity: pick(rng, ["light", "normal"]), minutes: Math.round(between(rng, 20, 30)), startTime: clock(765), memo: null });
  }
  if (chance(rng, 0.6)) day.reflection = pick(rng, MODEL_REFLECTIONS);
  if (chance(rng, 0.85)) {
    const count = 1 + Math.floor(rng() * 3);
    const bodies = new Set<string>();
    while (bodies.size < count) bodies.add(pick(rng, MODEL_POSITIVES));
    day.positives.push(...bodies);
  }
  return day;
}

// --- 3. 穴だらけ: 記録しない日が多く、あっても一部だけ。端の例(運動 5 件、食事 8 件、26 時台の食事)も混ぜる ---
const GAPPY_REFLECTIONS = ["疲れた。", "記録できなかった日が続いた。", "メモだけ。"];

function gappy({ i, rng }: Context): DayPlan | null {
  if (i === 40) {
    const day = emptyDay(); // 運動が 1 日の上限(5 件)の日
    for (let n = 0; n < 5; n++) day.exercises.push({ type: pick(rng, ["walk", "indoor", "strength", "other"]), intensity: pick(rng, ["light", "normal", "hard"]), minutes: Math.round(between(rng, 10, 30)), startTime: clock(420 + n * 150), memo: null });
    return day;
  }
  if (i === 55) {
    const day = emptyDay(); // 食事が 8 件の日
    for (let n = 0; n < 8; n++) day.meals.push({ time: clock(420 + n * 130), dish: pick(rng, ANY_DISH) });
    return day;
  }
  if (i === 70) {
    const day = emptyDay(); // 26 時台の食事と、起床だけの睡眠
    day.meals.push({ time: "26:40", dish: NIGHT_BINGE[3] });
    day.wake = "10:15";
    return day;
  }
  if (chance(rng, 0.3)) return null;
  const day = emptyDay();
  const kind = rng();
  const weight = () => round(84 + noise(rng, 1.5), 2);
  if (kind < 0.04) return day; // 日の行だけがある(何も入っていない)
  if (kind < 0.2) {
    day.weightKg = weight();
    if (chance(rng, 0.3)) day.bodyFat = round(27 + noise(rng, 1), 1);
    return day;
  }
  if (kind < 0.35) {
    const count = 1 + Math.floor(rng() * 2);
    for (let n = 0; n < count; n++) day.meals.push({ time: clock(between(rng, 420, 1500)), dish: pick(rng, ANY_DISH) });
    return day;
  }
  if (kind < 0.45) {
    if (chance(rng, 0.5)) day.bedtime = dayClock(between(rng, 60, 330));
    else day.wake = dayClock(between(rng, 360, 660));
    return day;
  }
  if (kind < 0.52) {
    if (chance(rng, 0.5)) day.reflection = pick(rng, GAPPY_REFLECTIONS);
    else day.positives.push("久しぶりに早く帰れた。ゆっくりできてよかった");
    return day;
  }
  if (chance(rng, 0.35)) day.weightKg = weight();
  if (chance(rng, 0.3)) {
    const bed = between(rng, 60, 330);
    day.bedtime = dayClock(bed);
    day.wake = dayClock(bed + between(rng, 5, 8) * 60);
  }
  if (chance(rng, 0.7)) {
    const count = 1 + Math.floor(rng() * 3);
    for (let n = 0; n < count; n++) day.meals.push({ time: clock(between(rng, 420, 1500)), dish: pick(rng, ANY_DISH) });
  }
  if (chance(rng, 0.12)) day.exercises.push({ type: pick(rng, ["walk", "indoor", "other"]), intensity: pick(rng, ["light", "normal"]), minutes: Math.round(between(rng, 10, 40)), startTime: chance(rng, 0.5) ? clock(between(rng, 360, 1260)) : null, memo: null });
  if (chance(rng, 0.15)) day.reflection = pick(rng, GAPPY_REFLECTIONS);
  return day;
}

const PERSONAS: Persona[] = [
  {
    id: `${DUMMY_PREFIX}collapsed`,
    name: "ダミー(崩れた俺)",
    email: "dummy-collapsed@example.com",
    seed: 1001,
    profile: { gender: "male", age: 35, heightCm: 172, currentWeightKg: 83, currentBodyFatPercent: 27.5, currentWaistCm: 93, waistMeasuredOn: threeMonthsAgo, activityLevel: "1.200", targetWeightKg: 74, targetCalories: 1800, targetProteinG: 110, targetSleepMinutes: 450, targetSleepMidpoint: "03:15" },
    plan: collapsed,
  },
  {
    id: `${DUMMY_PREFIX}model`,
    name: "ダミー(優等生)",
    email: "dummy-model@example.com",
    seed: 2002,
    profile: { gender: "female", age: 29, heightCm: 162, currentWeightKg: 54.5, currentBodyFatPercent: 22.5, currentWaistCm: 68.5, waistMeasuredOn: lastMonthEnd, activityLevel: "1.550", targetWeightKg: 52, targetCalories: 1750, targetProteinG: 90, targetSleepMinutes: 450, targetSleepMidpoint: "02:45" },
    plan: model,
  },
  {
    id: `${DUMMY_PREFIX}gappy`,
    name: "ダミー(穴だらけ)",
    email: "dummy-gappy@example.com",
    seed: 3003,
    profile: { gender: "other", age: 45, heightCm: 175, currentWeightKg: 84, currentBodyFatPercent: null, currentWaistCm: null, waistMeasuredOn: null, activityLevel: null, targetWeightKg: null, targetCalories: null, targetProteinG: null, targetSleepMinutes: 450, targetSleepMidpoint: "03:15" },
    plan: gappy,
  },
];

// ---------- 書き込み ----------

type Counts = { days: number; meals: number; exercises: number; positives: number };

async function seed(client: pg.Client, persona: Persona): Promise<Counts> {
  const counts: Counts = { days: 0, meals: 0, exercises: 0, positives: 0 };
  const rng = makeRng(persona.seed);
  const start = shift(today, -(DAYS - 1));

  await client.query("BEGIN");
  try {
    await client.query('INSERT INTO "user" (id, name, email, email_verified) VALUES ($1, $2, $3, true)', [persona.id, persona.name, persona.email]);
    const p = persona.profile;
    await client.query(
      `INSERT INTO profiles (user_id, gender, age, height_cm, current_weight_kg, current_body_fat_percent, current_waist_cm, waist_measured_on, activity_level, target_weight_kg, target_calories, target_protein_g, target_sleep_minutes, target_sleep_midpoint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [persona.id, p.gender, p.age, p.heightCm, p.currentWeightKg, p.currentBodyFatPercent, p.currentWaistCm, p.waistMeasuredOn, p.activityLevel, p.targetWeightKg, p.targetCalories, p.targetProteinG, p.targetSleepMinutes, p.targetSleepMidpoint],
    );

    for (let i = 0; i < DAYS; i++) {
      const date = shift(start, i);
      const plan = persona.plan({ i, t: i / (DAYS - 1), date, dow: weekday(date), rng });
      if (plan === null) continue;

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO days (user_id, date, morning_weight_kg, morning_body_fat_percent, sleep_bedtime, sleep_wake_time, reflection)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [persona.id, date, plan.weightKg, plan.bodyFat, plan.bedtime, plan.wake, plan.reflection],
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

await client.connect();
try {
  // ダミーユーザーだけを消す(user を消すと、記録も cascade で消える)。本物のユーザーには触れない
  const removed = await client.query("DELETE FROM \"user\" WHERE starts_with(id, $1)", [DUMMY_PREFIX]);
  console.log(`ダミーユーザーを ${removed.rowCount ?? 0} 人、消しました`);

  if (!process.argv.includes("--delete")) {
    for (const persona of PERSONAS) {
      const counts = await seed(client, persona);
      console.log(`${persona.email}: 日 ${counts.days} / 食事 ${counts.meals} / 運動 ${counts.exercises} / 良かったこと ${counts.positives}`);
    }
    console.log("ログインは、上のメールでマジックリンクを送る(リンクは next dev の端末に出る)。ALLOWED_EMAILS を設定しているときは、ダミーのメールも足す");
  }
} finally {
  await client.end();
}
