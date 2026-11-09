// 開発用のダミーデータを入れる。3 人のダミーユーザーに、100 日分の記録を作る(AI は呼ばない)。
//   node scripts/seed-dummy.mts            ダミーユーザーを消して、入れ直す
//   node scripts/seed-dummy.mts --delete   ダミーユーザーだけを消す
// 入れるのは開発用 DB(localhost:5433 の habit_health。docker compose の DB)だけ。それ以外の接続先では、何もせずに止まる。
// 同じ日に実行すれば、同じデータができる(乱数の種を固定している)。ダミーユーザーの id は "dummy-" で始まる。
// ログインは、ダミーユーザーのメールでマジックリンクを送る(リンクは next dev の端末に出る)。
// ALLOWED_EMAILS を設定しているときは、ダミーのメールもそこに足すこと。
// src/ のコードは import しない(Node がそのまま実行できるよう、別名の import を避ける)。列の名前は src/db/schema.ts と合わせる

import pg from "pg";
import { type Context, type DayPlan, type Persona, BREAKFAST, LUNCH_HEAVY, LUNCH_LIGHT, DINNER_LIGHT, NIGHT_BINGE, SNACK, ANY_DISH, between, chance, clock, dayClock, emptyDay, lastDayOfPreviousMonth, noise, pick, round, scaled, seedPersona, shift, todayString, weekday } from "#seed-lib";

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
    profile: { gender: "male", age: 35, heightCm: 172, currentWeightKg: 83, currentBodyFatPercent: 27.5, currentWaistCm: 93, waistMeasuredOn: threeMonthsAgo, activityLevel: "1.200", targetWeightKg: 74, targetCalories: 1800, targetSleepMinutes: 450, targetSleepMidpoint: "03:15" },
    plan: collapsed,
  },
  {
    id: `${DUMMY_PREFIX}model`,
    name: "ダミー(優等生)",
    email: "dummy-model@example.com",
    seed: 2002,
    profile: { gender: "female", age: 29, heightCm: 162, currentWeightKg: 54.5, currentBodyFatPercent: 22.5, currentWaistCm: 68.5, waistMeasuredOn: lastMonthEnd, activityLevel: "1.550", targetWeightKg: 52, targetCalories: 1750, targetSleepMinutes: 450, targetSleepMidpoint: "02:45" },
    plan: model,
  },
  {
    id: `${DUMMY_PREFIX}gappy`,
    name: "ダミー(穴だらけ)",
    email: "dummy-gappy@example.com",
    seed: 3003,
    profile: { gender: "other", age: 45, heightCm: 175, currentWeightKg: 84, currentBodyFatPercent: null, currentWaistCm: null, waistMeasuredOn: null, activityLevel: null, targetWeightKg: null, targetCalories: null, targetSleepMinutes: 450, targetSleepMidpoint: "03:15" },
    plan: gappy,
  },
];


await client.connect();
try {
  // ダミーユーザーだけを消す(user を消すと、記録も cascade で消える)。本物のユーザーには触れない
  const removed = await client.query("DELETE FROM \"user\" WHERE starts_with(id, $1)", [DUMMY_PREFIX]);
  console.log(`ダミーユーザーを ${removed.rowCount ?? 0} 人、消しました`);

  if (!process.argv.includes("--delete")) {
    for (const persona of PERSONAS) {
      const counts = await seedPersona(client, persona, { days: DAYS, today });
      console.log(`${persona.email}: 日 ${counts.days} / 食事 ${counts.meals} / 運動 ${counts.exercises} / 良かったこと ${counts.positives}`);
    }
    console.log("ログインは、上のメールでマジックリンクを送る(リンクは next dev の端末に出る)。ALLOWED_EMAILS を設定しているときは、ダミーのメールも足す");
  }
} finally {
  await client.end();
}

