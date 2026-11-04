import { Suspense } from "react";
import { BodyTrend } from "@/components/body-trend";
import { DayList } from "@/components/day-list";
import { ProfileSummary } from "@/components/profile-summary";
import { WaistReminder } from "@/components/waist-reminder";

// メインダッシュボード: 1日の消費カロリーの目安とプロフィール、日付ごとに1行の一覧(行をクリックすると /days/[date] の詳細へ)
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
      {/* 体重・体脂肪率の推移(置き場所は、ほかのグラフができてから決め直す) */}
      <Suspense fallback={<p className="text-zinc-500">推移を読み込み中...</p>}>
        <BodyTrend searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-zinc-500">記録を読み込み中...</p>}>
        <DayList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
