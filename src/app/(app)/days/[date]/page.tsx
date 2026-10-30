import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isRecordableDate } from "@/lib/date";
import { getDay } from "@/lib/days";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";

// 特定の日の詳細(閲覧)。編集は /days/[date]/edit。まだ記録が無い日は、記録を始めるリンクを出す
// params は Suspense の内側で読む(cacheComponents で静的シェルを残すため)
export default function DayPage({ params }: PageProps<"/days/[date]">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <DayContent params={params} />
    </Suspense>
  );
}

const unset = <span className="text-zinc-400">未入力</span>;

async function DayContent({ params }: Pick<PageProps<"/days/[date]">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();

  const day = await getDay(date);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-semibold">{date}</h1>
        </div>
        <Link
          href={`/days/${date}/edit`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          {day ? "編集" : "記録する"}
        </Link>
      </div>

      {!day ? (
        <p className="text-zinc-500">この日の記録はまだありません。</p>
      ) : (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-zinc-500">就寝(前の夜)</dt>
          <dd>{formatTimeOfDay(day.sleepBedtime) ?? unset}</dd>
          <dt className="text-zinc-500">起床</dt>
          <dd>{formatTimeOfDay(day.sleepWakeTime) ?? unset}</dd>
          <dt className="text-zinc-500">睡眠時間</dt>
          <dd>{formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime)) ?? unset}</dd>
          <dt className="text-zinc-500">朝の体重</dt>
          <dd>{day.morningWeightKg === null ? unset : `${day.morningWeightKg} kg`}</dd>
          <dt className="text-zinc-500">朝の体脂肪率</dt>
          <dd>{day.morningBodyFatPercent === null ? unset : `${day.morningBodyFatPercent} %`}</dd>
          <dt className="text-zinc-500">夜の振り返り</dt>
          {/* 改行をそのまま見せる */}
          <dd className="max-w-xl whitespace-pre-wrap">{day.reflection === null ? unset : day.reflection}</dd>
        </dl>
      )}
    </div>
  );
}
