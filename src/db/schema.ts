import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
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

    // 今日の振り返り(夜の振り返り・日記。自由記入で、あとで AI がフィードバックする対象)。AI の返事はここに書かず、別テーブルに置く
    reflection: text("reflection"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (table) => [
    // 1 ユーザーにつき 1 日 1 レコードに限定
    uniqueIndex("days_user_date_unique_idx").on(table.userId, table.date),
    check(
      "days_morning_weight_kg_range",
      sql`${table.morningWeightKg} IS NULL OR (${table.morningWeightKg} > 0 AND ${table.morningWeightKg} < 500)`,
    ),
    check(
      "days_morning_body_fat_percent_range",
      sql`${table.morningBodyFatPercent} IS NULL OR (${table.morningBodyFatPercent} > 0 AND ${table.morningBodyFatPercent} < 100)`,
    ),
  ],
);
