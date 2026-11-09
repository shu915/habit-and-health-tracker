// デモ用の人物を 1 人、入れる。「今の自分が 1 年後に、こうなっていたい」という想定の、400 日分の記録(AI は呼ばない)。
//   node scripts/seed-demo.mts             デモ用の人物を消して、入れ直す
//   node scripts/seed-demo.mts --delete    デモ用の人物だけを消す
//   node scripts/seed-demo.mts --dry-run   DB に入れずに、件数だけ出す
// メールアドレスと表示名は、scripts/demo.local.json(.gitignore で追跡しない)から読む。無ければ demo.example.json(ダミー)を使う。
// このリポジトリは公開なので、本物のメールアドレスは、コミットするファイルに書かない。demo.local.json には、profile を足して、プロフィールの値を上書きできる。
// 物語: 最初は夜食・体重・疲れの悩みが多く、運動はほとんどしない(活動係数 1.2)。少しずつ、夜食が減り、睡眠が整い、筋トレが習慣になる(活動係数 1.2 → 1.375。運動の記録は、そこに足される)。体重は約 96kg → 85kg。
// 入れるのは開発用 DB(localhost:5433 の habit_health)だけ。それ以外の接続先では、何もせずに止まる(本番のデモの入口は、まだ無い)。
// 同じ日に実行すれば、同じデータができる(乱数の種を固定している)。ユーザーの id は "demo-user"。

import { existsSync, readFileSync } from "node:fs";
import pg from "pg";
import {
  type Context,
  type DayPlan,
  type Persona,
  type Queryable,
  BREAKFAST,
  DINNER_LIGHT,
  LUNCH_HEAVY,
  LUNCH_LIGHT,
  NIGHT_BINGE,
  SNACK,
  between,
  chance,
  clock,
  dayClock,
  emptyDay,
  lastDayOfPreviousMonth,
  noise,
  pick,
  round,
  scaled,
  seedPersona,
  todayString,
  totalsOf,
} from "#seed-lib";

const DAYS = 400;
const DEMO_ID = "demo-user";
const DRY_RUN = process.argv.includes("--dry-run");

// ---------- 設定(メールアドレスと名前。本物の値は、追跡しないファイルにだけ置く) ----------

type Config = { email: string; name: string; profile?: Partial<Persona["profile"]> };

function loadConfig(): { config: Config; source: string } {
  const local = new URL("./demo.local.json", import.meta.url);
  const example = new URL("./demo.example.json", import.meta.url);
  const path = existsSync(local) ? local : example;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("設定が、オブジェクトではありません");
  const { email, name, profile } = parsed as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("設定の email が、メールアドレスの形ではありません");
  if (typeof name !== "string" || name.trim() === "") throw new Error("設定の name が、空です");
  const overrides = typeof profile === "object" && profile !== null ? (profile as Partial<Persona["profile"]>) : undefined;
  return { config: { email, name, profile: overrides }, source: path === local ? "demo.local.json" : "demo.example.json(ダミー)" };
}

// ---------- 接続先の確認(開発用 DB 以外には入れない) ----------

const connectionString = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/habit_health";
const client = new pg.Client({ connectionString });
if (!DRY_RUN && (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(client.host ?? "") || client.port !== 5433 || client.database !== "habit_health")) {
  throw new Error(`開発用 DB(localhost:5433 の habit_health)以外には入れません: ${client.host ?? "(host なし)"}:${client.port}/${client.database ?? "(DB 名なし)"}`);
}

// ---------- 物語 ----------

const today = todayString();
const lastMonthEnd = lastDayOfPreviousMonth(today);

const WORRIES = [
  "また夜中に食べてしまった。寝るのが遅くて、朝がつらい。",
  "昼は普通に食べたのに、夜にラーメンを我慢できなかった。",
  "体重が増えている。分かっているのに、やめられない。",
  "仕事が忙しくて、食事が夜に偏った。",
  "運動しなきゃと思うけど、疲れて動けなかった。",
];
const TURNING = [
  "今日は夜食を半分にできた。少しだけ前進。",
  "夜食なしで寝られた。朝の目覚めが少し楽だった。",
  "初めて週に 2 回、ジムに行けた。",
  "お菓子を我慢して、ナッツにした。",
  "体重が少し減っていた。続けてよかった。",
];
const ACHIEVEMENTS = [
  "予定どおりに過ごせた。夜はぐっすり眠れた。",
  "筋トレの重さを少し増やせた。",
  "野菜を多めに食べて、体が軽い。",
  "早めに寝る準備ができた。",
  "ズボンがゆるくなっていた。努力が形になってきた。",
  "朝から集中できた。睡眠が整うと違う。",
];
const POSITIVES_EARLY = ["久しぶりに散歩した。気分が軽くなった", "同僚が声をかけてくれた。ほっとした", "朝日を見られた。早起きできてよかった", "温かいお茶を飲んで、ひと息つけた"];
const POSITIVES_MID = ["夜食を我慢できた。自分で決められたことが嬉しい", "ジムの帰りに見た夕焼けがきれいだった", "今週は 3 回、体を動かせた", "朝ごはんを食べて、午前中が楽だった"];
const POSITIVES_LATE = [
  "ジムで前より重いものを持てた。続けてきた努力が報われた",
  "朝の空気が澄んでいた。深呼吸したら頭がすっきりした",
  "夕食のスープがおいしかった。丁寧に作ってよかった",
  "友人から嬉しいメッセージが届いた。つながりを感じられた",
  "鏡を見て、姿勢がよくなったと感じた",
  "時間どおりに仕事が終わった。段取りがうまくいった",
];
const LIFT_MEMOS: Record<number, string> = { 1: "脚の日", 3: "胸の日", 5: "背中の日", 6: "肩の日" };

const smooth = (t: number) => t * t * (3 - 2 * t);

function demo({ t, dow, rng }: Context): DayPlan | null {
  if (chance(rng, 0.08)) return null; // 約 9 割の日に記録する
  const day = emptyDay();
  const weekend = dow === 0 || dow === 6;

  // 活動係数と目標カロリーは、その日に固定する(物語の進み具合に合わせて変わる)
  // (消費の目安と食べた量のつじつまが合うように、運動の習慣が付いた後は、活動係数 1.375 と目標 2,200kcal。運動の記録は、そこに足される)
  day.stampActivityLevel = t < 0.3 ? "1.200" : "1.375";
  day.stampTargetCalories = t < 0.3 ? 2100 : 2200;

  // 体重: 最初の 40 日ほどは少し増え(96 → 97)、そのあと、ゆっくり下がる(→ 85)。途中に停滞がある
  const base = t < 0.1 ? 96 + 10 * t : 97 - (12 / 0.9) * (t - 0.1);
  const plateau = 0.8 * Math.exp(-(((t - 0.5) / 0.05) ** 2));
  if (chance(rng, 0.9)) {
    day.weightKg = round(base + plateau + (weekend ? 0.3 : 0) + noise(rng, 0.35), 2);
    if (chance(rng, 0.9)) day.bodyFat = round(31 - 6.5 * smooth(t) + noise(rng, 0.35), 1);
  }

  // 睡眠: 午前 1 時ごろから、23 時台へ。睡眠時間は 6 時間から 7 時間 20 分へ
  if (chance(rng, 0.92)) {
    const bed = 60 - 75 * t + (weekend ? 40 : 0) + noise(rng, 25);
    day.bedtime = dayClock(bed);
    day.wake = dayClock(bed + (6 + 1.3 * t + noise(rng, 0.3)) * 60);
  }

  // 食事
  const late = 1 - t; // 前半ほど 1 に近い
  if (chance(rng, 0.45 + 0.5 * t)) day.meals.push({ time: clock(between(rng, 420, 540)), dish: scaled(pick(rng, BREAKFAST), between(rng, 1 + 0.5 * t, 1.2 + 0.5 * t)) });
  const heavyLunch = chance(rng, 0.8 * late);
  day.meals.push({ time: clock(between(rng, 720, 800)), dish: scaled(pick(rng, heavyLunch ? LUNCH_HEAVY : LUNCH_LIGHT), between(rng, 1.15 + 0.6 * t, 1.35 + 0.6 * t)) });
  if (chance(rng, 0.93)) {
    const heavyDinner = chance(rng, 0.6 * late);
    day.meals.push({ time: clock(between(rng, 1110, 1190)), dish: scaled(pick(rng, heavyDinner ? [LUNCH_HEAVY[0], LUNCH_HEAVY[1]] : DINNER_LIGHT), between(rng, 1.35 + 0.6 * t, 1.75 + 0.6 * t)) });
  }
  if (chance(rng, 0.7 * late * late + 0.03)) {
    day.meals.push({ time: clock(between(rng, 1350, 1560)), dish: scaled(pick(rng, NIGHT_BINGE), between(rng, 0.8, 1.5)) }); // 22:30〜26:00
    if (chance(rng, 0.35 * late * late)) day.meals.push({ time: clock(between(rng, 1500, 1610)), dish: scaled(pick(rng, NIGHT_BINGE), between(rng, 0.7, 1.1)) });
  }
  if (chance(rng, 0.4)) day.meals.push({ time: clock(between(rng, 900, 940)), dish: pick(rng, t < 0.4 ? SNACK : [SNACK[0], SNACK[1]]) });

  // 運動: 前半はほとんどしない。中盤から筋トレが週 2 回、後半は週 4 回ほど。そのほかの日は散歩
  if (t < 0.15) {
    if (chance(rng, 0.1)) day.exercises.push({ type: "walk", intensity: "light", minutes: Math.round(between(rng, 15, 30)), startTime: clock(1200), memo: null });
  } else {
    const liftDays = t < 0.4 ? [1, 4] : [1, 3, 5, 6];
    const liftChance = t < 0.4 ? 0.7 : 0.85;
    if (liftDays.includes(dow) && chance(rng, liftChance)) {
      day.exercises.push({ type: "strength", intensity: chance(rng, 0.2) ? "hard" : "normal", minutes: Math.round(between(rng, 40, 60)), startTime: clock(1020), memo: chance(rng, 0.4) ? (LIFT_MEMOS[dow] ?? null) : null });
    } else if (chance(rng, t < 0.4 ? 0.3 : 0.5)) {
      day.exercises.push({ type: "walk", intensity: pick(rng, ["light", "normal"]), minutes: Math.round(between(rng, 20, 40)), startTime: clock(765), memo: null });
    }
  }

  // 日記: 前半は悩み、途中から「夜食を減らせた」という変化、後半は達成。良かったことも、同じように移っていく
  if (chance(rng, 0.55)) {
    const pool = chance(rng, late ** 1.5) ? WORRIES : t < 0.5 && chance(rng, 0.5) ? TURNING : ACHIEVEMENTS;
    day.reflection = pick(rng, pool);
  }
  if (chance(rng, 0.45 + 0.4 * t)) {
    const pool = t < 0.25 ? POSITIVES_EARLY : t < 0.6 ? POSITIVES_MID : POSITIVES_LATE;
    const count = 1 + Math.floor(rng() * 3);
    const bodies = new Set<string>();
    while (bodies.size < Math.min(count, pool.length)) bodies.add(pick(rng, pool));
    day.positives.push(...bodies);
  }
  return day;
}

// ---------- 実行 ----------

const { config, source } = loadConfig();
const persona: Persona = {
  id: DEMO_ID,
  name: config.name,
  email: config.email,
  seed: 4004,
  profile: {
    gender: "male",
    age: 40,
    heightCm: 175,
    currentWeightKg: 85,
    currentBodyFatPercent: 24.5,
    currentWaistCm: 96,
    waistMeasuredOn: lastMonthEnd,
    activityLevel: "1.375",
    targetWeightKg: 80,
    targetCalories: 2200,
    targetSleepMinutes: 450,
    targetSleepMidpoint: "02:45",
    ...config.profile,
  },
  plan: demo,
};

console.log(`設定: ${source}`);

if (DRY_RUN) {
  // DB に入れず、件数だけ数える(クエリを受け取って捨てる、見せかけの接続)
  const counting: Queryable = { query: async () => ({ rows: [{ id: 1 }] }) };
  // 100 日ずつの様子(体重・摂取・夜食の日・運動の日・活動係数)も出す。物語が意図どおりか、見て確かめるため
  const buckets = Array.from({ length: 4 }, () => ({ days: 0, weight: [] as number[], kcal: [] as number[], night: 0, exercise: 0, level: "" }));
  const watched: Persona = {
    ...persona,
    plan: (context) => {
      const plan = persona.plan(context);
      if (plan === null) return null;
      const b = buckets[Math.min(3, Math.floor(context.i / 100))];
      b.days += 1;
      if (plan.weightKg !== null) b.weight.push(plan.weightKg);
      if (plan.meals.length > 0) b.kcal.push(plan.meals.reduce((n, m) => n + totalsOf(m.dish.items).kcal, 0));
      if (plan.meals.some((m) => Number(m.time.slice(0, 2)) >= 24)) b.night += 1;
      if (plan.exercises.length > 0) b.exercise += 1;
      b.level = plan.stampActivityLevel ?? "";
      return plan;
    },
  };
  const counts = await seedPersona(counting, watched, { days: DAYS, today });
  console.log(`(DB には入れていません)日 ${counts.days} / 食事 ${counts.meals} / 運動 ${counts.exercises} / 良かったこと ${counts.positives}`);
  const avg = (values: number[]) => (values.length === 0 ? "-" : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
  buckets.forEach((b, n) => console.log(`${n * 100 + 1}〜${Math.min(400, n * 100 + 100)} 日目: 記録 ${b.days} 日 / 体重 平均 ${avg(b.weight)}kg / 1 日の摂取 平均 ${avg(b.kcal)}kcal / 24 時以降に食べた日 ${b.night} / 運動した日 ${b.exercise} / 活動係数 ${b.level}`));
} else {
  await client.connect();
  try {
    // 同じメールアドレスの、別のユーザー(本物のアカウント)がいたら、止める。消すのは、id が demo-user のユーザーだけ
    const clash = await client.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1 AND id <> $2', [persona.email, DEMO_ID]);
    if (clash.rows.length > 0) throw new Error("同じメールアドレスのユーザーが、すでにいます(デモ用ではありません)。消さずに止めました");
    const removed = await client.query('DELETE FROM "user" WHERE id = $1', [DEMO_ID]);
    console.log(`デモ用の人物を ${removed.rowCount ?? 0} 人、消しました`);
    if (!process.argv.includes("--delete")) {
      const counts = await seedPersona(client, persona, { days: DAYS, today });
      console.log(`${persona.email}: 日 ${counts.days} / 食事 ${counts.meals} / 運動 ${counts.exercises} / 良かったこと ${counts.positives}`);
      console.log("ログインは、このメールでマジックリンクを送る(リンクは next dev の端末に出る)。ALLOWED_EMAILS を設定しているときは、このメールも足す");
    }
  } finally {
    await client.end();
  }
}
