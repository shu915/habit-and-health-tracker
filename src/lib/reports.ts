import "server-only";
import { and, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidDateString } from "@/lib/date";
import { startOfMealDay } from "@/lib/meal-day-sql";
import { readStoredContent, type ReportContent } from "@/lib/report-content";
import { BADGE_KEYS, BADGE_TIERS, type Badge } from "@/lib/report-badges";
import { isLongTermReportKind, isOnDemandKind, isPerPeriodKind, isReportKind, LONG_TERM_REPORT_KINDS, ON_DEMAND_DAILY_LIMIT, ON_DEMAND_KINDS, type ReportKind } from "@/lib/report-period";
import type { TrendInputs } from "@/lib/trend-views";

// レポートの保存と読み出し(docs/ai-feedback.md)。ログイン中のユーザーの分だけ(全部 user_id で絞る)。
// 状態: creating(作成中)→ done(できた)/ failed(失敗)。作成を押したら、先に creating の行を保存して、すぐ返し(startReport)、
// AI の返事が来たら done(completeReport)、失敗したら failed(failReport)にする。裏の処理が殺されて、creating のまま一定時間たった行は、failed にする(failStale)。
// 保存するのは、AI の返事(検証済みの JSON)・バッジ・作った時点の元の数字(スナップショット。日記や食事の名前の文章は入れない)。読み戻すときも、形を確かめる

export type ReportStatus = "creating" | "done" | "failed";

// 作成中のまま、この分数たった行は、裏の処理が止まったとみなして、失敗にする(AI の呼び出しの最悪は、時間切れ 120 秒 × 2 回 = 約 4 分)
export const STALE_AFTER_MINUTES = 6;
// 長期(四半期・年次)は、月ごとのテーマ(最大 12 か月を、並行 3 で作る。1 回の時間切れが 60 秒なので、最大約 4 分)と、レポート本体(最大約 4 分)を、順に呼ぶので、最悪の所要時間は約 8 分。
// 6 分で止まったとみなすと、まだ裏で動いている行を失敗にしてしまう(作り直されて、AI の費用が二重になる)。そのため、長期は 12 分(2026-11-09 のレビュー)
export const STALE_AFTER_MINUTES_LONG_TERM = 12;
export const STALE_MESSAGE = "作成が途中で止まりました。もう一度作ってください。";

const badgeSchema = z.object({ key: z.enum(BADGE_KEYS), tier: z.enum(BADGE_TIERS), passed: z.number(), judged: z.number(), unit: z.enum(["day", "week"]) });
const nullableString = z.string().nullable();
const earlier = z.object({ weight: z.string(), date: z.string() }).nullable();
const snapshotSchema = z.object({
  dates: z.array(z.string()),
  finishedBefore: z.string(),
  rows: z.array(z.object({ date: z.string(), morningWeightKg: nullableString, morningBodyFatPercent: nullableString, sleepBedtime: nullableString, sleepWakeTime: nullableString, profileTargetCalories: z.number().nullable(), profileActivityLevel: nullableString })),
  intake: z.array(z.object({ date: z.string(), kcal: z.number(), mealCount: z.number() })),
  exercises: z.array(z.object({ date: z.string(), type: z.string(), intensity: z.string(), minutes: z.number() })),
  weightBeforeFrom: earlier,
  bodyFatBeforeFrom: earlier,
  targetBeforeFrom: z.number().nullable(),
  profile: z.object({ targetCalories: z.number().nullable(), currentWeightKg: nullableString, currentBodyFatPercent: nullableString, gender: nullableString, age: z.number().nullable(), heightCm: nullableString, activityLevel: nullableString, targetSleepMidpoint: nullableString }),
});

export type ReportSummary = { id: number; kind: ReportKind; periodStart: string; periodEnd: string; createdAt: Date; status: ReportStatus; errorMessage: string | null; badges: Badge[] };
// elapsedSeconds: 作成を押してからの秒数(DB の時計で出す。作成中の画面の経過秒数に使う。アプリと DB のタイムゾーンの違いに左右されない)
export type StoredReport = ReportSummary & { content: ReportContent | null; snapshot: TrendInputs | null; consentVersion: number; elapsedSeconds: number };

const parseBadges = (value: unknown): Badge[] => {
  const parsed = z.array(badgeSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};
const isStatus = (value: string): value is ReportStatus => value === "creating" || value === "done" || value === "failed";

function assertDate(date: string) {
  if (!isValidDateString(date)) throw new Error(`invalid date: ${date}`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 作成中のまま古くなった行を、失敗にする(その人の分だけ)
async function failStale(executor: Pick<Tx, "update">, userId: string): Promise<void> {
  await executor
    .update(reports)
    .set({ status: "failed", errorMessage: STALE_MESSAGE })
    .where(
      and(
        eq(reports.userId, userId),
        eq(reports.status, "creating"),
        or(
          and(notInArray(reports.kind, [...LONG_TERM_REPORT_KINDS]), sql`${reports.createdAt} < now() - make_interval(mins => ${STALE_AFTER_MINUTES})`),
          and(inArray(reports.kind, [...LONG_TERM_REPORT_KINDS]), sql`${reports.createdAt} < now() - make_interval(mins => ${STALE_AFTER_MINUTES_LONG_TERM})`),
        ),
      ),
    );
}

// 今の食事の日(03:00 区切り。lib/meal-day-sql.ts)の始まり以降に作った、随時レポート(作成中・できた。失敗は数えない)の数
async function onDemandCountToday(executor: Pick<Tx, "select">, userId: string): Promise<number> {
  const rows = await executor
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.userId, userId), inArray(reports.kind, [...ON_DEMAND_KINDS]), inArray(reports.status, ["creating", "done"]), sql`${reports.createdAt} >= ${startOfMealDay}`));
  return rows.length;
}

// 今日(03:00 区切り)、随時レポートをもう作ったか(画面で、ボタンを押せなくするため)
export async function isOnDemandUsedToday(): Promise<boolean> {
  const userId = await getCurrentUserId();
  return (await onDemandCountToday(db, userId)) >= ON_DEMAND_DAILY_LIMIT;
}

export type NewReport = { kind: ReportKind; periodStart: string; periodEnd: string; badges: Badge[]; snapshot: TrendInputs; consentVersion: number };
// 長期レポートは、1 回の作成で、月ごとのテーマ(最大 12 回)とレポート本体の AI を呼ぶ。失敗した行は、次の作成で消えるので、失敗を繰り返すと、AI の費用が膨らむ。
// そのため、同じ期間を最後に作り始めてから、この分数は、作り直せない(失敗した時刻の列が無いので、作り始めの時刻から数える。同意の撤回で止めた行も、数える。2026-11-09 のレビュー。全ユーザー合計の費用の上限は、公開前に決める。docs/release-checklist.md)
export const LONG_TERM_RETRY_WAIT_MINUTES = 10;

// 実際に待たせる分数。開発サーバー(NODE_ENV=development)では、待たせない(プロンプトを直しながら、何度も試すため)。テストと本番は、LONG_TERM_RETRY_WAIT_MINUTES
export const longTermRetryWaitMinutes = (env: { NODE_ENV?: string } = process.env): number => (env.NODE_ENV === "development" ? 0 : LONG_TERM_RETRY_WAIT_MINUTES);

export type StartResult = { ok: true; id: number } | { ok: false; reason: "in-progress" | "exists" | "daily-limit" | "retry-wait"; id?: number };

// 作成を始める: creating の行を保存する(AI の返事は、まだ無い)。同時に届いた要求は、ユーザー単位のロックで直列にする。
// 断る場合: 同じ種類(月次は、同じ月)が作成中(in-progress。その行の id を返す)/ その月が、もう作ってある(exists。同じ月は 1 回だけ)/ 今日の随時レポートを、もう作った(daily-limit)。
// 失敗した行は、数えず、入れ替える(消して作り直す)。今すぐの「前のできたレポート」は、新しいのができるまで残す(completeReport で消す)
export async function startReport(input: NewReport): Promise<StartResult> {
  const userId = await getCurrentUserId();
  if (!isReportKind(input.kind)) throw new Error(`invalid kind: ${input.kind}`);
  assertDate(input.periodStart);
  assertDate(input.periodEnd);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reports:${userId}`}))`);
    await failStale(tx, userId);

    // 月次と長期は、期間ごとに別のレポート(別の期間は、同時に作れる)。随時は、種類で 1 つ
    const sameReport = and(eq(reports.userId, userId), eq(reports.kind, input.kind), isPerPeriodKind(input.kind) ? eq(reports.periodStart, input.periodStart) : undefined);
    const [creating] = await tx.select({ id: reports.id }).from(reports).where(and(sameReport, eq(reports.status, "creating"))).limit(1);
    if (creating) return { ok: false, reason: "in-progress", id: creating.id } as const;

    if (isPerPeriodKind(input.kind)) {
      const [existing] = await tx.select({ id: reports.id }).from(reports).where(and(sameReport, eq(reports.status, "done"))).limit(1);
      if (existing) return { ok: false, reason: "exists", id: existing.id } as const;
    }
    if (isOnDemandKind(input.kind) && (await onDemandCountToday(tx, userId)) >= ON_DEMAND_DAILY_LIMIT) return { ok: false, reason: "daily-limit" } as const;
    if (isLongTermReportKind(input.kind) && longTermRetryWaitMinutes() > 0) {
      const [recentFailure] = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(and(sameReport, eq(reports.status, "failed"), sql`${reports.createdAt} > now() - make_interval(mins => ${longTermRetryWaitMinutes()})`))
        .limit(1);
      if (recentFailure) return { ok: false, reason: "retry-wait", id: recentFailure.id } as const;
    }

    // 失敗した行は、入れ替える(同じ種類・同じ月の失敗を消す。一意制約にも当たらない)
    await tx.delete(reports).where(and(sameReport, eq(reports.status, "failed")));
    const [row] = await tx
      .insert(reports)
      .values({ userId, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, status: "creating", badges: input.badges, snapshot: input.snapshot, consentVersion: input.consentVersion })
      .returning({ id: reports.id });
    return { ok: true, id: row.id } as const;
  });
}

// ---- 裏の処理が呼ぶ(リクエストの外。cookie などが読めないので、userId を引数で受け取る) ----
// userId は、認証済みの入口(startReport を呼んだ処理)が確かめた値を、そのまま渡す。ほかの場所から呼ばない

// AI の返事が来た: できた(done)にする。今すぐは、同じ種類の前のレポートを消して、最新の 1 件だけを残す。すでに done なら何もしない(false)
export async function completeReport(userId: string, id: number, content: ReportContent): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reports:${userId}`}))`);
    const [row] = await tx
      .update(reports)
      .set({ status: "done", content, errorMessage: null })
      .where(and(eq(reports.id, id), eq(reports.userId, userId), ne(reports.status, "done")))
      .returning({ kind: reports.kind });
    if (!row) return false;
    if (isReportKind(row.kind) && isOnDemandKind(row.kind)) {
      await tx.delete(reports).where(and(eq(reports.userId, userId), eq(reports.kind, row.kind), ne(reports.id, id)));
    }
    return true;
  });
}

// 失敗した: failed にして、利用者に見せる理由を残す(作成中の行だけ)
export async function failReport(userId: string, id: number, message: string): Promise<void> {
  await db.update(reports).set({ status: "failed", errorMessage: message }).where(and(eq(reports.id, id), eq(reports.userId, userId), eq(reports.status, "creating")));
}

// ---- 読み出し ----

// 期間の新しい順(作成中・失敗も含む)。作った順ではなく、月の順に並べる(過去の月を、あとから作っても、ばらばらにならない)。随時の直近 4 週間は、期間が今日で終わるので、いちばん上に来る。一覧用(中身とスナップショットは読まない)
export async function listReports(): Promise<ReportSummary[]> {
  const userId = await getCurrentUserId();
  await failStale(db, userId);
  const rows = await db
    .select({ id: reports.id, kind: reports.kind, periodStart: reports.periodStart, periodEnd: reports.periodEnd, createdAt: reports.createdAt, status: reports.status, errorMessage: reports.errorMessage, badges: reports.badges })
    .from(reports)
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.periodEnd), desc(reports.periodStart), desc(reports.id));
  return rows.flatMap((row) =>
    isReportKind(row.kind) && isStatus(row.status) ? [{ id: row.id, kind: row.kind, periodStart: row.periodStart, periodEnd: row.periodEnd, createdAt: row.createdAt, status: row.status, errorMessage: row.errorMessage, badges: parseBadges(row.badges) }] : [],
  );
}

// 1 件(自分のものだけ。無い・他のユーザーのものは null)。中身・スナップショットが読めなければ、その欄は null
export async function getReport(id: number): Promise<StoredReport | null> {
  const userId = await getCurrentUserId();
  if (!Number.isSafeInteger(id) || id < 1) return null;
  await failStale(db, userId);
  const [found] = await db
    .select({ report: reports, elapsed: sql<number>`extract(epoch from (now() - ${reports.createdAt}))` })
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, userId)))
    .limit(1);
  const row = found?.report;
  if (!row || !isReportKind(row.kind) || !isStatus(row.status)) return null;
  const snapshot = snapshotSchema.safeParse(row.snapshot);
  return {
    id: row.id,
    kind: row.kind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    createdAt: row.createdAt,
    status: row.status,
    errorMessage: row.errorMessage,
    badges: parseBadges(row.badges),
    content: row.status === "done" ? readStoredContent(row.content, { start: row.periodStart, end: row.periodEnd }) : null,
    snapshot: snapshot.success ? snapshot.data : null,
    consentVersion: row.consentVersion,
    elapsedSeconds: Math.max(0, Math.floor(Number(found.elapsed))),
  };
}

// その月のレポートが、作成中かできているか(月次は、同じ月を 1 回だけ。失敗は数えない)
export async function findMonthlyReport(periodStart: string): Promise<{ id: number; status: ReportStatus } | null> {
  const userId = await getCurrentUserId();
  assertDate(periodStart);
  await failStale(db, userId);
  const [row] = await db
    .select({ id: reports.id, status: reports.status })
    .from(reports)
    .where(and(eq(reports.userId, userId), eq(reports.kind, "monthly"), eq(reports.periodStart, periodStart), inArray(reports.status, ["creating", "done"])))
    .limit(1);
  return row && isStatus(row.status) ? { id: row.id, status: row.status } : null;
}
