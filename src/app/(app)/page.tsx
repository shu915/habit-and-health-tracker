import { Suspense } from "react";
import { DayList } from "@/components/day-list";
import { ProfileSummary } from "@/components/profile-summary";

// メインダッシュボード: 1日の消費カロリーの目安とプロフィール、日付ごとに1行の一覧(行をクリックすると /days/[date] の詳細へ)
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">ダッシュボード</h1>
      <Suspense fallback={<p className="text-zinc-500">プロフィールを読み込み中...</p>}>
        <ProfileSummary />
      </Suspense>
      <Suspense fallback={<p className="text-zinc-500">記録を読み込み中...</p>}>
        <DayList />
      </Suspense>
    </div>
  );
}
