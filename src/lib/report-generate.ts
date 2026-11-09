import "server-only";
import { getCurrentUserId } from "@/lib/current-user";
import { shiftDate } from "@/lib/date";
import { defaultMealDayAndTime } from "@/lib/meal-time";
import { completeJson, OpenRouterError } from "@/lib/openrouter";
import { calorieBadge, computeBadges, exerciseBadge, sleepBadge } from "@/lib/report-badges";
import { parseReportContent } from "@/lib/report-content";
import { AI_CONSENT_VERSION } from "@/lib/report-consent-text";
import { getAiConsent, grantAiConsent } from "@/lib/report-consent";
import { buildReportInput, type ReportInput } from "@/lib/report-input";
import { periodActivityLevel } from "@/lib/report-exercise";
import { isPastMonth, isReportKind, isYearMonth, reportEligibility, reportPeriod, type ReportKind, type ReportPeriod } from "@/lib/report-period";
import { REPORT_SYSTEM_PROMPT, reportJsonSchema } from "@/lib/report-prompt";
import { loadReportSource } from "@/lib/report-source";
import { completeReport, failReport, startReport } from "@/lib/reports";
import { listRecordKinds } from "@/lib/record-kinds";
import { MOVING_AVERAGE_DAYS } from "@/lib/trend";
import { loadTrendRaw } from "@/lib/trend-inputs";
import { buildTrendViews, type TrendInputs } from "@/lib/trend-views";

// AI フィードバック(レポート)を作る(docs/ai-feedback.md)。
// 作成は 2 段に分ける: ① createReport(リクエストの中): 認証 → 同意 → 作れる条件 → 材料を集める → 「作成中」の行を保存(随時は 1 日 1 回・月次は同じ月 1 回の制限はここ。食事の推定の回数制限(ai-limit.ts)には数えない)→ 裏の処理を予約して、すぐ返す。
// ② runReport(裏。リクエストを返したあと): AI を呼ぶ → 返事を検証 → 保存して「できた」にする / 失敗なら「失敗」にして理由を残す。
// AI の返事まで、30 秒ほど(長いと数分)かかり、裏で詰まることもあるので、画面を待たせない。裏の処理が殺されて、「作成中」のまま残った行は、一定時間後に失敗にする(lib/reports.ts の failStale)。
// 同じ種類が作成中なら、新しく作らない(連打で、AI が二重に呼ばれない)。随時レポートは、1 日に 1 回まで。不正な入力・同意なし・記録不足・上限は、AI を呼ぶ前に弾く。
// 裏の処理は、cookie などのリクエストの情報が読めないので、userId と、集めた材料を、閉じ込めて渡す(認証は、①の入口で済んでいる)
export type CreateReportResult =
  | { ok: true; id: number }
  | { ok: false; reason: "consent" | "invalid" | "not-enough" | "exists" | "in-progress" | "daily-limit"; message: string; existingId?: number };

// 裏の処理を予約する関数(本番は Next.js の after。テストは、集めて自分で実行する)
export type Schedule = (task: () => Promise<void>) => void;

const FAILURE_MESSAGES = {
  config: "AI の設定が済んでいません。管理者に連絡してください。",
  network: "AI に接続できませんでした。しばらくしてから、もう一度試してください。",
  http: "AI がエラーを返しました。しばらくしてから、もう一度試してください。",
  response: "AI の返事を読み取れませんでした。もう一度試してください。",
} as const;

// options.month: 月次のときの、作る月("2026-10")。過去の月だけ(今の月・未来・形が違う値は、断る。画面の入力なので、例外にはしない)
export async function createReport(kind: unknown, options: { consent: boolean; month?: string }, deps: { schedule: Schedule }): Promise<CreateReportResult> {
  const userId = await getCurrentUserId(); // 未ログインなら /login へ(例外)
  if (!isReportKind(kind)) throw new Error(`invalid kind: ${String(kind)}`); // 画面からは来ない値(プログラムの誤り)
  const reportKind: ReportKind = kind;

  // 同意: 最初の 1 回は、チェックを入れてもらう(入れていなければ、AI を呼ばない)。2 回目からは、保存した同意に付随する
  const consent = await getAiConsent();
  if (!consent.consented) {
    if (!options.consent) return { ok: false, reason: "consent", message: "AI に分析してもらうことへの同意のチェックを入れてください。" };
    await grantAiConsent();
  }

  const mealDay = defaultMealDayAndTime().date;
  if (reportKind === "monthly" && (options.month === undefined || !isYearMonth(options.month) || !isPastMonth(options.month, mealDay))) {
    return { ok: false, reason: "invalid", message: "作る月を、過去の月から選んでください。" };
  }
  const period = reportPeriod(reportKind, mealDay, options.month);

  const kinds = await listRecordKinds(period.start, period.end);
  const eligibility = reportEligibility(period, kinds.keys());
  if (!eligibility.ok) {
    return { ok: false, reason: "not-enough", message: `記録のある日が足りません(${eligibility.recorded} / ${eligibility.required} 日)。あと ${eligibility.missing} 日記録すると作れます。` };
  }

  // 数字(スナップショットになる)とバッジ
  const dates = Array.from({ length: period.days }, (_, i) => shiftDate(period.start, i));
  const raw = await loadTrendRaw({ from: shiftDate(period.start, -(MOVING_AVERAGE_DAYS - 1)), intakeFrom: period.start, to: period.end });
  const snapshot: TrendInputs = { ...raw, dates, finishedBefore: mealDay };
  const views = buildTrendViews(snapshot);
  const mealCounts = new Map(raw.intake.map((d) => [d.date, d.mealCount]));
  const badges = computeBadges({
    sleep: sleepBadge(views.sleep, raw.profile.targetSleepMidpoint, period.days),
    calorie: calorieBadge(
      views.calories.map((p) => ({ date: p.date, intake: p.intake, target: p.target, mealCount: mealCounts.get(p.date) ?? 0, inProgress: p.inProgress })),
      period.days,
    ),
    exercise: exerciseBadge(dates, raw.exercises.map((e) => e.date), period.days),
  });

  // 「作成中」の行を保存する(同時の連打・同じ種類の作成中・今日の随時・先月の作成済みは、ここで断る)
  const started = await startReport({ kind: reportKind, periodStart: period.start, periodEnd: period.end, badges, snapshot, consentVersion: AI_CONSENT_VERSION });
  if (!started.ok) {
    if (started.reason === "in-progress") return { ok: false, reason: "in-progress", message: "このレポートは、いま作成中です。", existingId: started.id };
    if (started.reason === "exists") return { ok: false, reason: "exists", message: "この月のレポートは、もう作ってあります。", existingId: started.id };
    return { ok: false, reason: "daily-limit", message: DAILY_LIMIT_MESSAGE };
  }
  const reportId = started.id;

  try {
    // 文章を含む材料(AI への入力にだけ使う。保存しない)
    const source = await loadReportSource(period.start, period.end);
    const input = buildReportInput({ period, dates, views, source, recordedDates: new Set(kinds.keys()), badges, activityLevel: periodActivityLevel(snapshot.rows, dates, snapshot.profile.activityLevel) });
    deps.schedule(() => runReport({ userId, reportId, period, input }));
  } catch (error) {
    await failReport(userId, reportId, FAILURE_MESSAGES.response); // 想定外の失敗でも、「作成中」のまま残さない
    throw error;
  }
  return { ok: true, id: reportId };
}

export const DAILY_LIMIT_MESSAGE = "随時レポートは、1 日に 1 回までです。明日の 3:00 以降に、また作れます。";

// 裏の処理: AI を呼んで、返事を検証して、保存する。どこで失敗しても、例外を外に出さず、「失敗」にして理由を残す(「作成中」のまま残さない)
export async function runReport(args: { userId: string; reportId: number; period: ReportPeriod; input: ReportInput }): Promise<void> {
  const { userId, reportId, period, input } = args;
  try {
    let text: string;
    try {
      text = await completeJson({
        messages: [
          { role: "system", content: REPORT_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(input) }, // 入力の内容(日記を含む)は、ログに出さない
        ],
        schemaName: "feedback_report",
        jsonSchema: reportJsonSchema,
        timeoutMs: 120_000, // 長い文章を返すので、食事の推定(35 秒)より延ばす
        maxOutputTokens: 12_000,
      });
    } catch (error) {
      if (!(error instanceof OpenRouterError)) throw error;
      console.error(`[report] ${error.kind}: ${error.message}`); // 詳しい理由は端末のログにだけ出す
      await failReport(userId, reportId, FAILURE_MESSAGES[error.kind]);
      return;
    }

    const parsed = parseReportContent(text, { start: period.start, end: period.end });
    if (!parsed.ok) {
      console.error(`[report] 返事の検証に失敗: ${parsed.reason}`);
      await failReport(userId, reportId, FAILURE_MESSAGES.response);
      return;
    }
    await completeReport(userId, reportId, parsed.content);
  } catch (error) {
    // エラーの種類だけを出す。メッセージは出さない(DB のエラーには、SQL のパラメータ = AI の返事(日記の引用を含む)が入りうるため。「ログに入力の内容を残さない」)
    console.error("[report] 想定外の失敗", error instanceof Error ? error.name : "unknown");
    await failReport(userId, reportId, FAILURE_MESSAGES.response);
  }
}
