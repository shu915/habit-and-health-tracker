import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { DayNavigation } from "@/components/day-navigation";
import { DayForm, type DayFormInitial } from "@/components/day-form";
import { isRecordableDate } from "@/lib/date";
import { requireRecordingProfile } from "@/lib/recording-gate";
import { getDay } from "@/lib/days";
import { saveDayAction } from "./actions";

// 特定の日の編集(まだ記録が無い日は、新しく作る)。閲覧は /days/[date]
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function DayEditPage({ params }: PageProps<"/days/[date]/edit">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <DayEditContent params={params} />
    </Suspense>
  );
}

async function DayEditContent({ params }: Pick<PageProps<"/days/[date]/edit">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();
  await requireRecordingProfile(date); // 日の行が無く、目標カロリーか活動係数が未設定なら、プロフィールの編集へ

  const day = await getDay(date);
  // DB の値(numeric は文字列、null は空欄)を、フォームの初期値(文字列)にする
  const initial: DayFormInitial = {
    sleepBedtime: day?.sleepBedtime ?? "",
    sleepWakeTime: day?.sleepWakeTime ?? "",
    morningWeightKg: day?.morningWeightKg ?? "",
    morningBodyFatPercent: day?.morningBodyFatPercent ?? "",
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の{day ? "編集" : "記録"}</h1>
        <DayNavigation date={date} hrefOf={(d) => `/days/${d}/edit`} />
      </div>
      {/* 日付を bind した Server Action を渡す(日付はフォームの入力ではなく、このページの URL から決まる) */}
      <DayForm date={date} initial={initial} action={saveDayAction.bind(null, date)} />
    </div>
  );
}
