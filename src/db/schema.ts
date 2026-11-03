import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Better Auth のテーブル(user / session / account / verification / rate_limit)。auth-schema.ts は生成物なので手編集しない
export * from "./auth-schema";

// アプリ用のテーブル。下書きの ER(Notion)に沿っている。
// user_id は user.id への外部キー(型は text、onDelete: cascade)。ユーザーを消すと、記録も一緒に消える

// ==========================================
// 1. Profiles (目標値・計算パラメータ・マスター)
// ==========================================
// 下書きの users に相当する。名前とメールは Better Auth の user にあるので持たない。
// user とは 1 対 1 で、user_id が主キー。ユーザーができた時点(ログイン後の最初の読み込み)で行を作る。
// その時点では本人が何も入力していないので、個人の値はすべて null。null は「未入力」を意味する
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),

    // ボディデータ(本人が入力する)
    gender: varchar("gender", { length: 20 }),
    age: integer("age"),
    heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
    currentWeightKg: numeric("current_weight_kg", { precision: 5, scale: 2 }),
    // 体重計が出す体脂肪率(%)。任意。測った値だけを入れる(式で見積もった値は入れない)
    currentBodyFatPercent: numeric("current_body_fat_percent", { precision: 4, scale: 1 }),
    currentWaistCm: numeric("current_waist_cm", { precision: 5, scale: 1 }),
    // ウエストを保存した日(YYYY-MM-DD。サーバーの日付)。月末の催促で、今月まだ保存していないかを見る。
    // ウエストを変えて保存する(updateProfile)か、催促の帯で更新する(recordWaistMeasurement)と今日になり、空にすると null。履歴は残らない
    waistMeasuredOn: date("waist_measured_on", { mode: "string" }),

    // 以下の 4 項目(活動係数と目標 3 つ)は、ボディデータを保存したあとに「算出」するので、それまでは null。
    // 人によって違うため DB の既定値は持たない。算出は、身長・体重・年齢・性別と生活のテキストから、
    // 計算式と AI の提案で出し、本人が確認して保存する(あとから直せる)。null のときは「目標が未設定」として扱う

    // 代謝・活動係数(1.2 座りがち / 1.375 軽い / 1.55 ふつう / 1.725 高い / 1.9 非常に高い)
    activityLevel: numeric("activity_level", { precision: 4, scale: 3 }),

    // 目標値(静的ベンチマーク)
    targetWeightKg: numeric("target_weight_kg", { precision: 5, scale: 2 }),
    targetCalories: integer("target_calories"),
    targetProteinG: numeric("target_protein_g", { precision: 5, scale: 1 }),

    // 睡眠の目標設定(分換算 & 基準中央値)。成人の一般的な目安を既定値にする
    // 空(null)にもできる。null は「睡眠の機能を使わない」で、睡眠の目標との比較を飛ばす。
    // 新しいユーザーには、一般的な値(450 分 / 03:15)が最初から入る
    targetSleepMinutes: integer("target_sleep_minutes").default(450), // 7.5 時間 = 450 分
    // 23:30 就寝・7:00 起床の人の中間時刻
    targetSleepMidpoint: varchar("target_sleep_midpoint", { length: 5 }).default("03:15"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 値の範囲。「絶対にあり得ない値」だけを止める広めの範囲(画面で見せる現実的な範囲は、アプリ側で別に検証する)。
    // null(未入力)は CHECK の対象外(式が NULL になると通る)
    check("profiles_age_range", sql`${table.age} BETWEEN 0 AND 150`),
    check("profiles_height_cm_range", sql`${table.heightCm} > 0 AND ${table.heightCm} <= 300`),
    check("profiles_current_weight_kg_range", sql`${table.currentWeightKg} > 0 AND ${table.currentWeightKg} < 500`),
    check(
      "profiles_current_body_fat_percent_range",
      sql`${table.currentBodyFatPercent} > 0 AND ${table.currentBodyFatPercent} < 100`,
    ),
    check("profiles_current_waist_cm_range", sql`${table.currentWaistCm} > 0 AND ${table.currentWaistCm} <= 300`),
    check("profiles_activity_level_range", sql`${table.activityLevel} BETWEEN 1 AND 3`),
    check("profiles_target_weight_kg_range", sql`${table.targetWeightKg} > 0 AND ${table.targetWeightKg} < 500`),
    check("profiles_target_calories_range", sql`${table.targetCalories} > 0 AND ${table.targetCalories} <= 10000`),
    check("profiles_target_protein_g_range", sql`${table.targetProteinG} >= 0 AND ${table.targetProteinG} <= 1000`),
    check("profiles_target_sleep_minutes_range", sql`${table.targetSleepMinutes} > 0 AND ${table.targetSleepMinutes} <= 1440`),
    // "HH:MM"(00:00〜23:59)
    check("profiles_target_sleep_midpoint_format", sql`${table.targetSleepMidpoint} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

// ==========================================
// 2. Days (親アンカー・日次サマリー)
// ==========================================
// 1 ユーザー × 1 日 = 1 行。ダッシュボードの「日付ごとに 1 行」はこのテーブルそのもの
export const days = pgTable(
  "days",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // drizzle では "YYYY-MM-DD" の文字列として扱う(タイムゾーンのずれを避ける)
    date: date("date", { mode: "string" }).notNull(),

    // 朝の測定
    morningWeightKg: numeric("morning_weight_kg", { precision: 5, scale: 2 }),
    // 体重計が出す体脂肪率(%)。毎朝同じ条件で測ると傾向が分かる。測った値だけを入れる
    morningBodyFatPercent: numeric("morning_body_fat_percent", { precision: 4, scale: 1 }),

    // 睡眠: 起きた日の朝に記録する(前の夜の就寝時刻と、今朝の起床時刻。"HH:MM")。空は「記録しない」。
    // 睡眠時間などは、この 2 つから計算する(列には保存しない)
    sleepBedtime: varchar("sleep_bedtime", { length: 5 }),
    sleepWakeTime: varchar("sleep_wake_time", { length: 5 }),

    // 今日の気づき(反省・気づき・明日への一言。自由記入で、あとで AI がフィードバックする対象)。AI の返事はここに書かず、別テーブルに置く
    reflection: text("reflection"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 1 ユーザーにつき 1 日 1 レコードに限定
    uniqueIndex("days_user_date_unique_idx").on(table.userId, table.date),
    // meals の複合外部キー(user_id, day_id)の参照先。食事の持ち主と、その日の持ち主が一致することを DB で保証する
    unique("days_user_id_id_unique").on(table.userId, table.id),
    check(
      "days_morning_weight_kg_range",
      sql`${table.morningWeightKg} IS NULL OR (${table.morningWeightKg} > 0 AND ${table.morningWeightKg} < 500)`,
    ),
    check(
      "days_morning_body_fat_percent_range",
      sql`${table.morningBodyFatPercent} IS NULL OR (${table.morningBodyFatPercent} > 0 AND ${table.morningBodyFatPercent} < 100)`,
    ),
    check("days_sleep_bedtime_format", sql`${table.sleepBedtime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("days_sleep_wake_time_format", sql`${table.sleepWakeTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

// ==========================================
// 3. Meals (食事ログ)
// ==========================================
// 1 食 = 1 行。1 日の数は決めない(可変長)。days の行に紐づける(その日の食事が、その日の記録に属する)。
// 食事を保存するときは、その日の days の行が無ければ空で作る。user_id は days の持ち主と同じにする(保存する側で守る)
export const meals = pgTable(
  "meals",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 「その日」の days の行。深夜 3 時までの食事は前の日に入れる(だから時刻は 26:59 まで書ける)。日が消えたら食事も消える。
    // 外部キーは下の複合キー(user_id, day_id)。他のユーザーの日には紐づけられない
    dayId: integer("day_id").notNull(),
    // 食べた時刻 "HH:MM"(00:00〜26:59。24:00 以降は、翌日の 0:00 以降の深夜)。朝・昼・晩のラベルは保存せず、時刻から計算する
    eatenTime: varchar("eaten_time", { length: 5 }).notNull(),

    // AI が付けた料理名(グルーピングの鍵)。表記ゆれは、過去の dish_name の一覧を AI に渡して揃える。人は直さない
    dishName: varchar("dish_name", { length: 100 }).notNull(),
    // 人が付ける別名(表示用。あれば dish_name より優先して出す)。AI に渡す名前の一覧には入れない
    alias: varchar("alias", { length: 100 }),
    // 入力した内容(写真から読み取った内容を含む)を、AI が意味を変えずに読みやすく整えた説明文(写真そのものは保存しない)。再推定の入力にもなる
    description: text("description"),

    // 1 食の合計。すべての食事は AI の推定で、数字は直接直せない(直すときは説明を直して再推定する)。
    // 集計はこの列だけを使い、合計は AI ではなくコードで品目を足して出す
    kcal: integer("kcal").notNull(),
    proteinG: numeric("protein_g", { precision: 5, scale: 1 }).notNull(),
    fatG: numeric("fat_g", { precision: 5, scale: 1 }).notNull(),
    // 糖質 = 炭水化物 − 食物繊維(コードで計算して入れる)
    netCarbG: numeric("net_carb_g", { precision: 5, scale: 1 }).notNull(),
    // 食物繊維と食塩相当量(g)。分からないときは null
    fiberG: numeric("fiber_g", { precision: 4, scale: 1 }),
    saltG: numeric("salt_g", { precision: 4, scale: 1 }),

    // AI が返した品目ごとの内訳(参考用。集計には使わない)。zod で検証してから保存し、読むときも検証し直す
    items: jsonb("items").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 食事の持ち主(user_id)と、その日(days)の持ち主が同じであることを、DB が保証する(日が消えたら食事も消える)
    foreignKey({ name: "meals_user_day_fk", columns: [table.userId, table.dayId], foreignColumns: [days.userId, days.id] }).onDelete("cascade"),
    // その日の食事の一覧を引く
    index("meals_user_day_idx").on(table.userId, table.dayId),
    // 値の範囲。「絶対にあり得ない値」だけを止める広い範囲(現実的な範囲は meal-limits.ts の app で検証する)
    check("meals_eaten_time_format", sql`${table.eatenTime} ~ '^([01][0-9]|2[0-6]):[0-5][0-9]$'`),
    check("meals_kcal_range", sql`${table.kcal} >= 0 AND ${table.kcal} <= 20000`),
    check("meals_protein_g_range", sql`${table.proteinG} >= 0 AND ${table.proteinG} <= 1000`),
    check("meals_fat_g_range", sql`${table.fatG} >= 0 AND ${table.fatG} <= 1000`),
    check("meals_net_carb_g_range", sql`${table.netCarbG} >= 0 AND ${table.netCarbG} <= 2000`),
    check("meals_fiber_g_range", sql`${table.fiberG} IS NULL OR (${table.fiberG} >= 0 AND ${table.fiberG} <= 500)`),
    check("meals_salt_g_range", sql`${table.saltG} IS NULL OR (${table.saltG} >= 0 AND ${table.saltG} <= 100)`),
  ],
);

// ==========================================
// 4. Exercises (運動ログ)
// ==========================================
// 1 回の運動 = 1 行。1 日の数は決めない(可変長)。meals と同じく days の行に紐づけ、複合外部キーで持ち主を揃える。
// 「ふだんの運動」はプロフィールの活動係数に含まれているので、ここには「いつもより多く動いた分」だけを記録する(消費に足す)。
// 消費カロリーは列に保存せず、種類・強さ・時間と、その日の体重から計算する(lib/exercise.ts)。AI は使わない
export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayId: integer("day_id").notNull(),
    // 種類のキー(lib/exercise.ts の EXERCISE_TYPES)。種類を足してもマイグレーションが要らないよう、CHECK には名前を書かない
    type: varchar("type", { length: 20 }).notNull(),
    // 強さ: light / normal / hard
    intensity: varchar("intensity", { length: 10 }).notNull(),
    minutes: integer("minutes").notNull(),
    // 始めた時刻(任意)。"HH:MM"で、00:00〜26:59(食事の食べた時刻と同じ。24 時以降は前の日の深夜)。null は「記録しない」
    startTime: varchar("start_time", { length: 5 }),
    // 自分用のメモ(任意)。AI には送らない
    memo: varchar("memo", { length: 200 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 運動の持ち主(user_id)と、その日(days)の持ち主が同じであることを、DB が保証する(日が消えたら運動も消える)
    foreignKey({ name: "exercises_user_day_fk", columns: [table.userId, table.dayId], foreignColumns: [days.userId, days.id] }).onDelete("cascade"),
    index("exercises_user_day_idx").on(table.userId, table.dayId),
    check("exercises_intensity_values", sql`${table.intensity} IN ('light', 'normal', 'hard')`),
    check("exercises_minutes_range", sql`${table.minutes} >= 1 AND ${table.minutes} <= 1440`),
    check("exercises_start_time_format", sql`${table.startTime} IS NULL OR ${table.startTime} ~ '^([01][0-9]|2[0-6]):[0-5][0-9]$'`),
  ],
);

// ==========================================
// 5. Positive Entries (ポジティブ3行日記: 良かったこと)
// ==========================================
// 良かったこと 1 件 = 1 行。1 日 3 件まで(position の CHECK と、日ごとの position の一意制約が DB で守る)。
// 本文は 1 欄の自由記入(「できごと。それで感じたこと」)。保存は、その日の分をまとめて入れ替える(lib/positive-entries.ts)。
// 内容は気分や出来事なので、AI には送らない(送るなら集計した形だけにする、と決めてから)
export const positiveEntries = pgTable(
  "positive_entries",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dayId: integer("day_id").notNull(),
    // 1〜3。空欄をつめた順(書いた順)
    position: integer("position").notNull(),
    body: varchar("body", { length: 200 }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 持ち主(user_id)と、その日(days)の持ち主が同じであることを、DB が保証する(日が消えたら一緒に消える)
    foreignKey({ name: "positive_entries_user_day_fk", columns: [table.userId, table.dayId], foreignColumns: [days.userId, days.id] }).onDelete("cascade"),
    unique("positive_entries_day_position_unique").on(table.dayId, table.position),
    check("positive_entries_position_range", sql`${table.position} >= 1 AND ${table.position} <= 3`),
  ],
);

// ==========================================
// 6. AI Requests (AI の呼び出しの記録。回数の制限に使う)
// ==========================================
// AI を呼ぶたびに 1 行を足し、直近の件数を数えて、課金が膨らむのを防ぐ(lib/ai-limit.ts)。
// サーバーが複数に分かれても効くよう、メモリではなく DB で数える。古い行は、足すときに消す
export const aiRequests = pgTable(
  "ai_requests",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("ai_requests_user_created_idx").on(table.userId, table.createdAt)],
);
