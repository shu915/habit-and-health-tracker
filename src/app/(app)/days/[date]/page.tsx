import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { buttonClass } from "@/components/button";
import { DayResult } from "@/components/day-result";
import { DayNavigation } from "@/components/day-navigation";
import { DayVitals } from "@/components/day-vitals";
import { ExerciseList } from "@/components/exercise-list";
import { MealList } from "@/components/meal-list";
import { PositiveList } from "@/components/positive-list";
import { ReflectionSection } from "@/components/reflection-section";
import { isRecordableDate } from "@/lib/date";
import { getDay } from "@/lib/days";

// 特定の日の詳細(閲覧)。編集は /days/[date]/edit。まだ記録が無い日は、記録を始めるリンクを出す
// params は Suspense の内側で読む(読み込み中の表示を先に出すため)
export default function DayPage({ params }: PageProps<"/days/[date]">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <DayContent params={params} />
    </Suspense>
  );
}

async function DayContent({ params }: Pick<PageProps<"/days/[date]">, "params">) {
  const { date } = await params;
  await connection(); // 「今日」(new Date())を使うので、事前描画ではなくリクエスト時に実行する
  if (!isRecordableDate(date)) notFound();

  const day = await getDay(date);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <BackLink href="/">ダッシュボードに戻る</BackLink>
          <h1 className="text-2xl font-semibold">{date}</h1>
          <DayNavigation date={date} hrefOf={(d) => `/days/${d}`} />
        </div>
        <Link href={`/days/${date}/edit`} className={buttonClass()}>
          {day ? "編集" : "記録する"}
        </Link>
      </div>

      {/* 過ぎた日だけ、摂取と消費の目安の結果を出す(今日と未来は、まだ記録が増えるので出さない) */}
      <Suspense fallback={null}>
        <DayResult date={date} />
      </Suspense>

      {!day ? (
        <p className="text-zinc-500">この日の記録はまだありません。</p>
      ) : (
        <DayVitals day={day} />
      )}

      {/* その日の食事(日の記録が無い日でも、「食事を追加」から追加できる)。一覧の読み込みは別に待つ */}
      <Suspense fallback={<p className="text-zinc-500">食事を読み込み中...</p>}>
        <MealList date={date} />
      </Suspense>

      {/* いつもより多く動いた分の運動 */}
      <Suspense fallback={<p className="text-zinc-500">運動を読み込み中...</p>}>
        <ExerciseList date={date} />
      </Suspense>

      {/* ポジティブ3行日記(良かったこと) */}
      <Suspense fallback={<p className="text-zinc-500">良かったことを読み込み中...</p>}>
        <PositiveList date={date} />
      </Suspense>

      {/* 今日の気づき(自由記入)。編集は別のパス */}
      <ReflectionSection date={date} reflection={day?.reflection ?? null} />

      {/* 縦に長いので、下まで読んだ人のために、上と同じ戻るリンクを置く */}
      <div>
        <BackLink href="/">ダッシュボードに戻る</BackLink>
      </div>
    </div>
  );
}
