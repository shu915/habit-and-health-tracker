import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { MealForm } from "@/components/meal-form";
import { isRecordableDate } from "@/lib/date";
import { requireRecordingProfile } from "@/lib/recording-gate";

// 食事の追加。文章・写真から AI が推定し、確認してから保存する(保存は meals/actions.ts)
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function NewMealPage({ params }: PageProps<"/days/[date]/meals/new">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の食事を追加</h1>
      </div>
      <MealForm date={date} mode="new" />
    </div>
  );
}
