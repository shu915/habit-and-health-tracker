import Link from "next/link";
import { DayJumpForm } from "@/components/day-jump-form";
import { DAY_LIST_ID, DayPager } from "@/components/day-pager";
import { clampPage, lastPage as lastPageOf, parsePage } from "@/lib/day-pages";
import { countDays, listDaysPage } from "@/lib/days";
import { formatDuration } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";

// ダッシュボードの日付ごとの一覧(新しい日が上)。記録のある日だけを、14 件ずつ(?page=)出す。行のどこをクリックしても、その日の詳細へ移動する。
// 記録の無い日の行は出さない。新しい日は、見出しの右の日付欄から作る(記録の無い日・今日を含む)
const COLUMNS = ["日付", "睡眠時間", "朝の体重", "朝の体脂肪率", "今日の気づき"];

export async function DayList({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const total = await countDays();
  const lastPage = lastPageOf(total);
  const page = clampPage(parsePage((await searchParams).page), lastPage); // 範囲外のページは最後のページに寄せる
  const rows = await listDaysPage(page);

  return (
    <section id={DAY_LIST_ID} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">日々の記録</h2>
          {rows.length > 0 && (
            <p className="text-sm text-zinc-500 tabular-nums">
              {rows[rows.length - 1].date} 〜 {rows[0].date}
            </p>
          )}
        </div>
        {/* 一覧の見出しの右に置く: 日付を選んで「編集」。記録がある日は編集、無い日は新規作成になる(初期値は今日) */}
        <DayJumpForm />
      </div>
      {rows.length === 0 ? ( // 記録ゼロ。件数を数えたあとで行が消えて、ページが空になったときも、空の表を出さない
        <p className="text-sm text-zinc-500">まだ記録がありません。右上の日付を選んで「編集」から始めてください。</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column} className="px-4 py-2 font-medium">
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
                    className="relative border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2 tabular-nums">
                      <Link href={`/days/${day.date}`} className="font-medium after:absolute after:inset-0">
                        {day.date}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime)) ?? "-"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{day.morningWeightKg === null ? "-" : `${day.morningWeightKg} kg`}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {day.morningBodyFatPercent === null ? "-" : `${day.morningBodyFatPercent} %`}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-zinc-500">{firstLine(day.reflection)}</td>
                    {/* 行全体が押せることを示す印(押せる範囲は日付のリンクが担う) */}
                    <td aria-hidden className="px-2 py-2 text-right text-zinc-400">
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
