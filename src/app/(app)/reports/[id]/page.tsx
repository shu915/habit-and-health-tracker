import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ReportProgress } from "@/components/report-progress";
import { ReportView } from "@/components/report-view";
import { reportTitle } from "@/lib/report-format";
import { getReport } from "@/lib/reports";

// 作ったレポートの表示(docs/ai-feedback.md)。自分のレポートだけ(無い・他のユーザーのものは 404)。
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <BackLink href="/reports">AI レポートに戻る</BackLink>
      <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
        <ReportContent params={params} />
      </Suspense>
      {/* 長いレポートを読み終えたあとに、上までスクロールして戻らなくて済むよう、下にも置く */}
      <BackLink href="/reports">AI レポートに戻る</BackLink>
    </div>
  );
}

async function ReportContent({ params }: Pick<PageProps<"/reports/[id]">, "params">) {
  const { id } = await params;
  const report = /^\d{1,9}$/.test(id) ? await getReport(Number(id)) : null; // 数字以外・桁が多すぎる id は、DB に聞かずに 404
  if (!report) notFound();
  if (report.status === "creating") {
    // 作成中: AI が裏で分析している。ページを閉じても続く。できたら、この画面が、レポートに切り替わる
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{reportTitle(report.kind, report.periodStart, report.periodEnd)}</h1>
        <p className="text-sm text-ink-muted">AI がレポートを作っています。できると、この画面が切り替わります。</p>
        <ReportProgress elapsedSeconds={report.elapsedSeconds} />
      </div>
    );
  }
  if (report.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{reportTitle(report.kind, report.periodStart, report.periodEnd)}</h1>
        <p role="alert" className="text-red-600 dark:text-red-400">
          レポートを作れませんでした。{report.errorMessage ?? ""}
        </p>
        <p className="text-sm text-ink-muted">失敗したレポートは、今日の随時レポートの回数には数えません。「AI レポート」から、もう一度作れます。</p>
      </div>
    );
  }
  return <ReportView report={report} />;
}
