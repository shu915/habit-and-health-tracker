import Link from "next/link";
import { DayJumpForm } from "@/components/day-jump-form";
import { DAY_LIST_ID, DayPager } from "@/components/day-pager";
import { shiftDate, todayString } from "@/lib/date";
import { clampPage, lastPage as lastPageOf, pageDates, pageRange, parsePage } from "@/lib/day-pages";
import { getFirstDayDate, listDaysInRange } from "@/lib/days";
import { formatDuration } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";

// ダッシュボードの日付ごとの一覧(新しい日が上)。行のどこをクリックしても、その日の詳細へ移動する。
// 14 日ずつ(?page=)、今日から過去へさかのぼる。記録の無い日も 1 行ずつ出し、そこから「記録する」で書き始められる。
// 「今日」はサーバーの日付(利用者のタイムゾーンとずれうる)なので、1 ページ目には、記録のあるサーバーの明日も出す。最初の記録の日(その人の開始日)より前は出さない
const COLUMNS = ["日付", "睡眠時間", "朝の体重", "朝の体脂肪率", "今日の気づき"];

export async function DayList({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const today = todayString();
  const firstDate = await getFirstDayDate();
  const lastPage = lastPageOf(today, firstDate);
  const page = clampPage(parsePage((await searchParams).page), lastPage); // 範囲外のページは最後のページに寄せる
  const { from, to } = pageRange(today, page);
  // 1 ページ目は、サーバーの明日の記録も取る(pageDates の説明を参照)
  const rows = await listDaysInRange(from, page === 1 ? shiftDate(today, 1) : to);
  const recorded = new Map(rows.map((day) => [day.date, day]));
  const dates = pageDates(today, page, new Set(recorded.keys()), firstDate);

  return (
    <section id={DAY_LIST_ID} className="flex scroll-mt-4 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">日々の記録</h2>
          <p className="text-sm text-zinc-500 tabular-nums">
            {dates[dates.length - 1]} 〜 {dates[0]}
          </p>
        </div>
        {/* 一覧の見出しの右に置く: 日付を選んで「編集」。記録がある日は編集、無い日は新規作成になる(初期値は今日) */}
        <DayJumpForm />
      </div>
      {firstDate === null && (
        <p className="text-sm text-zinc-500">まだ記録がありません。日付の行をクリックするか、右上の日付を選んで「編集」から始めてください。</p>
      )}
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
            {dates.map((date) => {
              const day = recorded.get(date);
              if (!day) {
                // 記録の無い日: 行全体が、その日の記録を始める画面(編集)へのリンク
                return (
                  <tr
                    key={date}
                    className="relative border-t border-zinc-100 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2 tabular-nums">
                      <Link href={`/days/${date}/edit`} className="after:absolute after:inset-0">
                        {date}
                      </Link>
                    </td>
                    <td colSpan={COLUMNS.length - 1} className="px-4 py-2">
                      記録なし
                    </td>
                    <td className="px-2 py-2 text-right text-xs whitespace-nowrap">記録する ›</td>
                  </tr>
                );
              }
              // 日付のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
              return (
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
              );
            })}
          </tbody>
        </table>
      </div>
      <DayPager page={page} lastPage={lastPage} />
    </section>
  );
}

// 振り返りの 1 行目(長いときは表示側で切る)。未入力は "-"
function firstLine(reflection: string | null): string {
  if (reflection === null) return "-";
  return reflection.split("\n")[0] ?? "-";
}
