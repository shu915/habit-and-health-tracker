import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { ReflectionForm } from "@/components/reflection-form";
import { isRecordableDate } from "@/lib/date";
import { requireRecordingProfile } from "@/lib/recording-gate";
import { getDay } from "@/lib/days";
import { saveReflectionAction } from "./actions";

// 今日の気づきの編集。朝の記録(/days/[date]/edit)とは別のパス。保存は reflection/actions.ts
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function ReflectionPage({ params }: PageProps<"/days/[date]/reflection">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <ReflectionContent params={params} />
    </Suspense>
  );
}

async function ReflectionContent({ params }: Pick<PageProps<"/days/[date]/reflection">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();
  await requireRecordingProfile(date); // 日の行が無く、目標カロリーか活動係数が未設定なら、プロフィールの編集へ

  const day = await getDay(date);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の気づき</h1>
      </div>
      <ReflectionForm date={date} initial={day?.reflection ?? ""} action={saveReflectionAction.bind(null, date)} />
    </div>
  );
}
