import { Suspense } from "react";
import { DayList } from "@/components/day-list";
import { ProfileSummary } from "@/components/profile-summary";
import { TrendSection } from "@/components/trend-section";
import { WaistReminder } from "@/components/waist-reminder";

// メインダッシュボード: 1日の消費カロリーの目安とプロフィール、記録のある日の一覧(行をクリックすると /days/[date] の詳細へ。日付欄から、古い日も開ける)、その下に推移のグラフ
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
