import { Suspense } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/button";
import { DayList } from "@/components/day-list";
import { ProfileSummary } from "@/components/profile-summary";
import { TrendSection } from "@/components/trend-section";
import { WaistReminder } from "@/components/waist-reminder";

// メインダッシュボード: AI レポートへのボタン、1 日の消費カロリーの目安とプロフィール、記録のある日の一覧(行をクリックすると /days/[date] の詳細へ。日付欄から、古い日も開ける)、その下に推移のグラフ
export default function DashboardPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">ダッシュボード</h1>
      <Suspense fallback={null}>
        <WaistReminder />
      </Suspense>
      <Suspense fallback={<p className="text-zinc-500">プロフィールを読み込み中...</p>}>
        <ProfileSummary />
      </Suspense>
      {/* AI レポートへの入り口(ボタン 1 つ。レポートは別ページ /reports。ダッシュボードは、いまのデータで縦に長いので、ここには置かない) */}
      <section aria-label="AI レポート" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold">AI レポート</h2>
          <p className="text-sm text-zinc-500">記録を AI が振り返って、グラフと文章でまとめます。整った項目には、バッジを贈ります。</p>
        </div>
        <Link href="/reports" className={buttonClass()}>
          レポートを見る・作る
        </Link>
      </section>
      {/* 日々の記録を上に置く: 記録は毎日の操作で、日付欄(開く)がこの見出しの右にある。グラフはときどき見るものなので、その下 */}
      <Suspense fallback={<p className="text-zinc-500">記録を読み込み中...</p>}>
        <DayList searchParams={searchParams} />
      </Suspense>
      {/* 推移(体重・体脂肪率・睡眠。ほかのグラフが増えても、ここに足す) */}
      <Suspense fallback={<p className="text-zinc-500">推移を読み込み中...</p>}>
        <TrendSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
