import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { ReportCreateForm } from "@/components/report-create-form";
import { getAiConsent } from "@/lib/report-consent";
import { badgeLabel, reportTitle } from "@/lib/report-format";
import { getReportOptions } from "@/lib/report-options";
import { listReports } from "@/lib/reports";
import { createReportAction, revokeConsentAction } from "./actions";

// AI レポート(docs/ai-feedback.md)。随時(直近 4 週間。1 日 1 回まで)と、定期(月次。過去の、どの月でも選べる。同じ月は 1 回だけ)を作る。作ったレポートの一覧(随時は最新の 1 件、月次は月ごと)。
// 作成の処理は、返事を返したあと、裏(after)で AI を呼び続けるので、実行時間の上限を延ばす(AI の呼び出しの最悪は、時間切れ 120 秒 × 2 回)。
// 「今日」を使うので、事前描画ではなく、リクエスト時に実行する
export const maxDuration = 300;

export default function ReportsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <BackLink href="/">ダッシュボードに戻る</BackLink>
        <h1 className="text-2xl font-semibold">AI レポート</h1>
        <p className="mt-1 text-sm text-zinc-500">記録を AI が振り返って、グラフと文章でまとめます。数字の範囲に収まった項目には、バッジを贈ります。</p>
      </div>
      <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
        <ReportsContent />
      </Suspense>
    </div>
  );
}

async function ReportsContent() {
  await connection();
  const [consent, options, reports] = await Promise.all([getAiConsent(), getReportOptions(), listReports()]);

  const onDemand = reports.filter((report) => report.kind !== "monthly");
  const periodic = reports.filter((report) => report.kind === "monthly");

  return (
    <ReportCreateForm
      consented={consent.consented}
      action={createReportAction}
      revokeAction={revokeConsentAction}
      onDemand={{ start: options.onDemand.period.start, end: options.onDemand.period.end, recorded: options.onDemand.eligibility.recorded, required: options.onDemand.eligibility.required, missing: options.onDemand.eligibility.missing, ok: options.onDemand.eligibility.ok, creatingId: options.onDemand.creatingId, blockedToday: options.onDemand.blockedToday }}
      months={options.months.map((m) => ({ month: m.month, recorded: m.eligibility.recorded, required: m.eligibility.required, missing: m.eligibility.missing, ok: m.eligibility.ok, existingId: m.existingId, creatingId: m.creatingId }))}
      onDemandSaved={<ReportList reports={onDemand} />}
      periodicSaved={<ReportList reports={periodic} />}
    />
  );
}

// 作ったレポートの一覧(行のどこを押しても、そのレポートへ)
function ReportList({ reports }: { reports: Awaited<ReturnType<typeof listReports>> }) {
  if (reports.length === 0) return <p className="text-sm text-zinc-500">まだありません。</p>;
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
      {reports.map((report) => (
        <li key={report.id} className="relative flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
          <div>
            <Link href={`/reports/${report.id}`} className="font-medium after:absolute after:inset-0">
              {reportTitle(report.kind, report.periodStart, report.periodEnd)}
            </Link>
            <p className="text-xs text-zinc-500">{report.createdAt.toLocaleDateString("ja-JP")} に作成</p>
          </div>
          <p className="text-xs text-zinc-500">
            {report.status === "creating" ? "作成中" : report.status === "failed" ? "作れませんでした" : report.badges.length === 0 ? "" : report.badges.map(badgeLabel).join(" ・ ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
