import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DayForm, type DayFormInitial } from "@/components/day-form";
import { isRecordableDate, shiftDate } from "@/lib/date";
import { getDay } from "@/lib/days";
import { saveDayAction } from "./actions";

// 特定の日の編集(まだ記録が無い日は、新しく作る)。閲覧は /days/[date]
// params は Suspense の内側で読む(cacheComponents で静的シェルを残すため)
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

  const day = await getDay(date);
  // DB の値(numeric は文字列、null は空欄)を、フォームの初期値(文字列)にする
  const initial: DayFormInitial = {
    morningWeightKg: day?.morningWeightKg ?? "",
    morningBodyFatPercent: day?.morningBodyFatPercent ?? "",
    reflection: day?.reflection ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/days/${date}`} className="text-sm text-zinc-500 hover:underline">
          ← {date} の詳細
        </Link>
        <h1 className="text-2xl font-semibold">{date} の{day ? "編集" : "記録"}</h1>
        <DayNavigation date={date} />
      </div>
      {/* 日付を bind した Server Action を渡す(日付はフォームの入力ではなく、このページの URL から決まる) */}
      <DayForm date={date} initial={initial} action={saveDayAction.bind(null, date)} />
    </div>
  );
}

// 別の日に移る: 前の日・次の日(翌日より先は記録できないので出さない)。離れた日はダッシュボードで日付を選ぶ
function DayNavigation({ date }: { date: string }) {
  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const linkClass = "text-sm text-zinc-500 hover:underline";

  return (
    <nav aria-label="別の日に移る" className="mt-1 flex gap-4">
      {isRecordableDate(previous) && (
        <Link href={`/days/${previous}/edit`} className={linkClass}>
          ← 前の日
        </Link>
      )}
      {isRecordableDate(next) && (
        <Link href={`/days/${next}/edit`} className={linkClass}>
          次の日 →
        </Link>
      )}
    </nav>
  );
}
