import Link from "next/link";
import { Suspense } from "react";
import { DayJumpForm } from "@/components/day-jump-form";
import { DAY_LIST_ID, DayPager } from "@/components/day-pager";
import { RecordCalendar } from "@/components/record-calendar";
import { clampPage, lastPage as lastPageOf, parsePage } from "@/lib/day-pages";
import { countDays, listDaysPage } from "@/lib/days";
import { formatDuration } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";

// ダッシュボードの日付ごとの一覧(新しい日が上)。記録のある日だけを、14 件ずつ(?page=)出す。行のどこをクリックしても、その日の詳細へ移動する。
// 記録の無い日の行は出さない。新しい日は、一覧の直上の行の日付欄から作る(記録の無い日・今日を含む)
const COLUMNS = ["日付", "睡眠時間", "朝の体重", "朝の体脂肪率", "今日の気づき"];
// 狭い画面では、列が詰まって横スクロールになるので、気づきの冒頭の列は隠す(日の詳細で読める)
const REFLECTION_COLUMN = "今日の気づき";

export async function DayList({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const total = await countDays();
  const lastPage = lastPageOf(total);
  const page = clampPage(parsePage((await searchParams).page), lastPage); // 範囲外のページは最後のページに寄せる
  const rows = await listDaysPage(page);

  return (
    <section id={DAY_LIST_ID} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="text-xl font-bold">日々の記録</h2>
      {/* 記録のカレンダー(直近 1 年。狭い画面は 13 週)。記録がまったく無い人には出さない(全部が灰色になるだけなので)。ページ送りとは無関係(期間は固定) */}
      {total > 0 && (
        <Suspense fallback={null}>
          <RecordCalendar />
        </Suspense>
      )}
      {/* 一覧の直上の行: 左に一覧の範囲、右に日付欄と「開く」(その日の詳細へ。初期値は今日)。一覧に出ない古い日・記録の無い日も、ここから開く。カレンダーを挟んで一覧と離れないよう、一覧のすぐ上に置く */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {rows.length > 0 && (
          <p className="text-sm text-ink-muted tabular-nums">
            {rows[rows.length - 1].date} 〜 {rows[0].date}
          </p>
        )}
        <div className="ml-auto">
          <DayJumpForm />
        </div>
      </div>
      {rows.length === 0 ? ( // 記録ゼロ。件数を数えたあとで行が消えて、ページが空になったときも、空の表を出さない
        <p className="text-sm text-ink-muted">まだ記録がありません。日付を選んで「開く」から始めてください。</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-muted">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column} className={`px-2 py-3 font-medium first:pl-4 sm:px-4 sm:first:pl-5 ${column === REFLECTION_COLUMN ? "hidden sm:table-cell" : ""}`}>
                      {column}
                    </th>
                  ))}
                  {/* 右端の「›」の列(見出しは空) */}
                  <th aria-hidden className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((day) => (
                  // 日付のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
                  <tr
                    key={day.id}
                    className="relative border-t border-line-soft hover:bg-surface-hover"
                  >
                    <td className="py-3 pr-2 pl-4 tabular-nums sm:pr-4 sm:pl-5">
                      <Link href={`/days/${day.date}`} className="font-medium after:absolute after:inset-0">
                        {day.date}
                      </Link>
                    </td>
                    <td className="px-2 py-3 tabular-nums sm:px-4">
                      {formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime)) ?? "-"}
                    </td>
                    <td className="px-2 py-3 tabular-nums sm:px-4">{day.morningWeightKg === null ? "-" : `${day.morningWeightKg} kg`}</td>
                    <td className="px-2 py-3 tabular-nums sm:px-4">
                      {day.morningBodyFatPercent === null ? "-" : `${day.morningBodyFatPercent} %`}
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-3 sm:table-cell text-ink-muted">{firstLine(day.reflection)}</td>
                    {/* 行全体が押せることを示す印(押せる範囲は日付のリンクが担う) */}
                    <td aria-hidden className="px-2 py-3 text-right sm:pr-4 text-ink-decor">
                      ›
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DayPager page={page} lastPage={lastPage} />
        </>
      )}
    </section>
  );
}

// 振り返りの 1 行目(長いときは表示側で切る)。未入力は "-"
function firstLine(reflection: string | null): string {
  if (reflection === null) return "-";
  return reflection.split("\n")[0] ?? "-";
}
