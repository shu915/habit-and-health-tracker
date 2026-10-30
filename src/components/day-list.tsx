import Link from "next/link";
import { DayJumpForm } from "@/components/day-jump-form";
import { listDays } from "@/lib/days";
import { formatDuration } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";

// ダッシュボードの日付ごとの一覧(新しい日が上)。行のどこをクリックしても、その日の詳細へ移動する。
// 全期間を出す(期間の絞り込みは、記録が増えてから)。食事・運動の列は、それぞれの記録を作るときに足す
const COLUMNS = ["日付", "睡眠時間", "朝の体重", "朝の体脂肪率", "夜の振り返り"];

export async function DayList() {
  const days = await listDays();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">日々の記録</h2>
        {/* 一覧の見出しの右に置く: 日付を選んで「編集」。記録がある日は編集、無い日は新規作成になる(初期値は今日) */}
        <DayJumpForm />
      </div>
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
            {days.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-zinc-500">
                  まだ記録がありません。右上の日付を選んで「編集」から追加してください。
                </td>
              </tr>
            ) : (
              days.map((day) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 振り返りの 1 行目(長いときは表示側で切る)。未入力は "-"
function firstLine(reflection: string | null): string {
  if (reflection === null) return "-";
  return reflection.split("\n")[0] ?? "-";
}
