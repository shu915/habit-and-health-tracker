import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { MealForm } from "@/components/meal-form";
import { isRecordableDate } from "@/lib/date";
import { requireRecordingProfile } from "@/lib/recording-gate";

// 食事の追加。文章・写真から AI が推定し、確認してから保存する(保存は meals/actions.ts)
// この画面から呼ぶ AI の推定は、1 回の試行の時間切れ 35 秒 × 2 回(openrouter.ts)で、最悪約 70 秒かかる。
// 実行時間の上限が短い設定(Vercel の既定が 10〜15 秒の場合)だと、写真つきの推定が途中で切れるので、延ばしておく(デプロイのとき、プランの上限を確かめる。docs/release-checklist.md)
export const maxDuration = 90;
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function NewMealPage({ params }: PageProps<"/days/[date]/meals/new">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
      <NewMealContent params={params} />
    </Suspense>
  );
}

async function NewMealContent({ params }: Pick<PageProps<"/days/[date]/meals/new">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();
  await requireRecordingProfile(date); // 日の行が無く、目標カロリーか活動係数が未設定なら、プロフィールの編集へ

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{date} の食事を追加</h1>
      </div>
      <MealForm date={date} mode="new" />
    </div>
  );
}
