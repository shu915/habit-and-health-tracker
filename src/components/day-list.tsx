import Link from "next/link";
import { Suspense } from "react";
import { DayJumpForm } from "@/components/day-jump-form";
import { DAY_LIST_ID, DayPager } from "@/components/day-pager";
import { RecordCalendar } from "@/components/record-calendar";
import { clampPage, lastPage as lastPageOf, parsePage } from "@/lib/day-pages";
import { countDays, listDaysPage } from "@/lib/days";
import { formatDuration } from "@/lib/duration";
import { sleepMinutes } from "@/lib/sleep";
import type { DayListSummary } from "@/lib/day-list-summary";
import { loadDayListSummary } from "@/lib/day-list-summary-load";

// ダッシュボードの日付ごとの一覧(新しい日が上)。記録のある日だけを、14 件ずつ(?page=)出す。行のどこをクリックしても、その日の詳細へ移動する。
// 記録の無い日の行は出さない。新しい日は、一覧の直上の行の日付欄から作る(記録の無い日・今日を含む)
// 列(優先順位。2026-11-06、利用者の決定): 日付 / 睡眠時間 / 体重 / 摂取(kcal だけ。データ不足の日は「不足」)/ 気づきの冒頭。
// 一覧の役目は、日々の記録を眺めて、開く日を選ぶこと。食事の回数・睡眠の中間時刻・体脂肪率・運動は出さない(推移のグラフと日の詳細で見られる。情報が多いと、眺めにくい)。
// 狭い画面は、日付(年を省く)・睡眠・体重・摂取だけにする(気づきは、日の詳細で読める)
const COLUMNS: { label: string; narrow: boolean }[] = [
  { label: "日付", narrow: true },
  { label: "睡眠", narrow: true },
  { label: "体重", narrow: true },
  { label: "摂取", narrow: true },
  { label: "気づき", narrow: false },
];
const HIDE_ON_NARROW = "hidden sm:table-cell";
// 気づき以外の列は、折り返さない(日本語は、どの字でも折り返せるので、列が狭くなると「5時/間/32/分」と 1 字ずつ折れる)。余った幅は、気づきの列が使い、長ければ「…」で切る。
// 気づきの列にも、最低の幅(12rem)を持たせる: 列が多くて入りきらないときは、気づきを潰さず、表の枠の中で横にスクロールする(最後の列はテキストなので、スクロールで隠れても困らない)
const REFLECTION_MIN_WIDTH = "min-w-[12rem]";

export async function DayList({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const total = await countDays();
  const lastPage = lastPageOf(total);
  const page = clampPage(parsePage((await searchParams).page), lastPage); // 範囲外のページは最後のページに寄せる
  const rows = await listDaysPage(page);
  const summaries = await loadDayListSummary(rows.map((day) => day.date)); // 摂取・食事の回数・運動を、1 ページ分まとめて取る

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
                    <th key={column.label} className={`whitespace-nowrap px-2 py-3 font-medium first:pl-4 sm:px-5 sm:first:pl-6 ${column.narrow ? "" : HIDE_ON_NARROW} ${column.label === "気づき" ? REFLECTION_MIN_WIDTH : ""}`}>
                      {column.label}
                    </th>
                  ))}
                  {/* 右端の「›」の列(見出しは空) */}
                  <th aria-hidden className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((day) => (
                  // 行のどの欄も、その日の詳細へのリンクにする(欄ごとに本物のリンク)。以前は、日付のリンクを行全体に広げていた(after:absolute)が、スマホでは押しても動かなかったため、位置の基準に頼らない形にした
                  <tr key={day.id} className="border-t border-line-soft hover:bg-surface-hover">
                    <td className="whitespace-nowrap tabular-nums">
                      {/* 狭い画面は、年を省く(11-05)。読み上げと、リンクの名前は、いつも日付の全体。キーボードと読み上げのリンクは、この日付だけ(ほかの欄は、押せるだけ) */}
                      <Link href={`/days/${day.date}`} aria-label={day.date} className="block py-3 pr-2 pl-4 font-medium sm:pr-5 sm:pl-6">
                        <span aria-hidden className="sm:hidden">
                          {day.date.slice(5)}
                        </span>
                        <span aria-hidden className="hidden sm:inline">
                          {day.date}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      <CellLink date={day.date} className="px-2 sm:px-5">
                        {formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime)) ?? "-"}
                      </CellLink>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      <CellLink date={day.date} className="px-2 sm:px-5">
                        {day.morningWeightKg === null ? "-" : `${day.morningWeightKg} kg`}
                      </CellLink>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      <CellLink date={day.date} className="px-2 sm:px-5">
                        <IntakeCell summary={summaries.get(day.date)} />
                      </CellLink>
                    </td>
                    <td className={`hidden w-full max-w-0 text-ink-muted sm:table-cell ${REFLECTION_MIN_WIDTH}`}>
                      <CellLink date={day.date} className="truncate px-3">
                        {firstLine(day.reflection)}
                      </CellLink>
                    </td>
                    {/* 行全体が押せることを示す印 */}
                    <td className="text-ink-decor">
                      <CellLink date={day.date} className="px-2 text-right sm:pr-4">
                        ›
                      </CellLink>
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

// 日付以外の欄のリンク: 押せる範囲を欄いっぱいに広げる。読み上げ・キーボードには出さない(日付のリンクと重複するため)
function CellLink({ date, className, children }: { date: string; className: string; children: React.ReactNode }) {
  return (
    <Link href={`/days/${date}`} aria-hidden tabIndex={-1} className={`block py-3 ${className}`}>
      {children}
    </Link>
  );
}

// 摂取の欄(1 行): 摂取 kcal と、データ不足の日は「不足」。食事の回数は出さない(利用者の決定)。
// データ不足の日(食事が 1 回だけ、または摂取が目標の 6 割未満)は、数字を薄くする(1 食しか入れていない日を、ダイエットが進んだ日と誤解させない。責めない言い方で、赤にしない)
function IntakeCell({ summary }: { summary: DayListSummary | undefined }) {
  if (!summary || summary.intakeKcal === null) return <>-</>;
  return (
    <span className="whitespace-nowrap">
      <span className={summary.sparse ? "text-ink-muted" : undefined}>{summary.intakeKcal.toLocaleString("ja-JP")} kcal</span>{" "}
      {summary.sparse && (
        <span className="text-xs text-ink-muted">
          <span className="sr-only">データ</span>不足
        </span>
      )}
    </span>
  );
}

// 振り返りの 1 行目(長いときは表示側で切る)。未入力は "-"
function firstLine(reflection: string | null): string {
  if (reflection === null) return "-";
  return reflection.split("\n")[0] ?? "-";
}
