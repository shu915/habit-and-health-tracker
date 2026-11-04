import Link from "next/link";
import { SleepChart } from "@/components/sleep-chart";
import { TrendChart } from "@/components/trend-chart";
import { shiftDate, todayString } from "@/lib/date";
import { listDayMeasures } from "@/lib/days";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { buildSleepTrend, buildTrend, latestAverage, latestRecorded, MOVING_AVERAGE_DAYS, parseTrendRange, TREND_RANGES, trendDates, trendEnd, valuesByDate, nightClock, sleepMedians, type SleepPoint, type TrendPoint, type TrendRange } from "@/lib/trend";

// ダッシュボードの「推移」。体重・体脂肪率・睡眠の 3 つの図を並べる。期間は 7 / 28 / 90 日(?range=、既定 28 日)で、期間の切り替えは 1 つだけ(下のすべての図に効く)。
// 今日までの期間(サーバーの明日に朝の記録があれば、その日まで)で、朝の記録から作る(AI は使わない)。
// 体重と体脂肪率は単位が違うので、1 つの図に重ねず、2 つに分ける。各図に、表の形の代替(読み上げ・キーボード用)を付ける。
// 「今日」はサーバーの日付(利用者のタイムゾーンと数時間ずれうる)。3 つの図は、同じ日付の並びなので、ホバーを連動させる
const SYNC_ID = "trend";

export async function TrendSection({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseTrendRange((await searchParams).range);
  const today = todayString();
  // 期間より 6 日前(移動平均の窓)から、サーバーの明日までの記録を取る。明日に朝の記録があれば、期間の末尾を明日にする(trendEnd)
  const rows = await listDayMeasures(shiftDate(today, -(range - 1) - (MOVING_AVERAGE_DAYS - 1)), shiftDate(today, 1));
  const end = trendEnd(
    today,
    new Set(rows.filter((d) => d.morningWeightKg !== null || d.morningBodyFatPercent !== null || d.sleepBedtime !== null || d.sleepWakeTime !== null).map((d) => d.date)),
  );
  const dates = trendDates(end, range);
  const weight = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningWeightKg }))), 2);
  const bodyFat = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningBodyFatPercent }))), 1);
  const sleep = buildSleepTrend(dates, new Map(rows.map((d) => [d.date, { bedtime: d.sleepBedtime, wakeTime: d.sleepWakeTime }])));

  return (
    <section aria-label="推移" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">推移</h2>
        <RangeTabs current={range} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TrendCard title="体重" unit="kg" digits={2} points={weight} />
        <TrendCard title="体脂肪率" unit="%" digits={1} points={bodyFat} />
        <div className="md:col-span-2">
          <SleepCard points={sleep} />
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        体重・体脂肪率: 点はその日の朝の記録、線は過去 {MOVING_AVERAGE_DAYS} 日の移動平均(記録が 2 日分以上あるとき)です。体重計の値は水分などで日々ぶれるので、傾向は線で見ます。睡眠: 帯は就寝(上)から起床(下)まで、細い線は中間時刻です。
      </p>
    </section>
  );
}

// 期間の切り替え(リンク。表示は URL で決まるので、サーバーだけで足りる)
function RangeTabs({ current }: { current: TrendRange }) {
  return (
    <nav aria-label="期間" className="flex gap-1 text-sm">
      {TREND_RANGES.map((days) => (
        <Link
          key={days}
          href={`/?range=${days}`}
          scroll={false} // 期間を切り替えても、ページの一番上へ戻さない(今見ている位置のまま、グラフだけ変わる)
          aria-current={days === current ? "page" : undefined}
          className={days === current ? "rounded-md bg-zinc-200 px-3 py-1 font-medium dark:bg-zinc-800" : "rounded-md px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}
        >
          {days} 日
        </Link>
      ))}
    </nav>
  );
}

function TrendCard({ title, unit, digits, points }: { title: string; unit: string; digits: number; points: TrendPoint[] }) {
  const format = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const latest = latestRecorded(points);
  const average = latestAverage(points);
  const recorded = points.filter((p) => p.value !== null).length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-sm font-medium text-zinc-500">{title}</h3>
        {latest ? (
          <p>
            <span className="text-2xl font-semibold">{format(latest.value ?? 0)}</span> <span className="text-sm text-zinc-500">{unit}</span>
            <span className="ml-2 text-xs text-zinc-500">{latest.date} の記録{average?.average != null && ` ・ 7 日平均 ${format(average.average)} ${unit}`}</span>
          </p>
        ) : (
          <p className="text-sm text-zinc-500">この期間の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && <TrendChart title={title} unit={unit} digits={digits} points={points} syncId={SYNC_ID} />}

      {recorded > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500">表で見る</summary>
          <div className="mt-2 max-h-60 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">日付</th>
                  <th className="py-1 text-right font-normal">その日</th>
                  <th className="py-1 text-right font-normal">7 日平均</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.date} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="py-1">{p.date}</td>
                    <td className="py-1 text-right">{p.value === null ? "-" : `${format(p.value)} ${unit}`}</td>
                    <td className="py-1 text-right">{p.average === null ? "-" : `${format(p.average)} ${unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// 睡眠のカード: 見出しに睡眠時間の中央値と、就寝・起床・中間時刻の中央値、凡例(帯と線)、図、表の形の代替
function SleepCard({ points }: { points: SleepPoint[] }) {
  const recorded = points.filter((p) => p.range !== null).length;
  const medians = sleepMedians(points);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 className="text-sm font-medium text-zinc-500">睡眠</h3>
        {recorded > 0 ? (
          <>
            <p>
              <span className="text-2xl font-semibold">{formatDuration(medians.minutes)}</span> <span className="text-sm text-zinc-500">睡眠時間の中央値</span>
            </p>
            {/* 数字はすべて中央値(徹夜や極端に短い日が混ざっても引きずられない「ふだんの値」。時刻は日をまたいでも壊れない) */}
            <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <MedianTime label="就寝" value={medians.bedtime} />
              <MedianTime label="起床" value={medians.wakeTime} />
              <MedianTime label="中間時刻" value={medians.midpoint} />
            </dl>
            <p className="mt-1 text-xs text-zinc-500">
              すべて中央値 ・ {points.length} 日中 {recorded} 日に記録
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">この期間の記録がありません。</p>
        )}
      </div>

      {recorded > 0 && (
        <>
          {/* 凡例: 帯(四角)と、中間時刻(線)。色だけに頼らず、名前で区別する */}
          <p className="flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-series)", opacity: 0.85 }} />
              就寝〜起床
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--viz-text)" }} />
              中間時刻
            </span>
          </p>
          <SleepChart points={points} syncId={SYNC_ID} />
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-500">表で見る</summary>
            <div className="mt-2 max-h-60 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1 font-normal">日付</th>
                    <th className="py-1 text-right font-normal">就寝</th>
                    <th className="py-1 text-right font-normal">起床</th>
                    <th className="py-1 text-right font-normal">睡眠時間</th>
                    <th className="py-1 text-right font-normal">中間時刻</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-zinc-100 dark:border-zinc-900">
                      <td className="py-1">{p.date}</td>
                      <td className="py-1 text-right">{p.bedtime ?? "-"}</td>
                      <td className="py-1 text-right">{p.wakeTime ?? "-"}</td>
                      <td className="py-1 text-right">{formatDuration(p.minutes) ?? "-"}</td>
                      <td className="py-1 text-right">{p.midpoint === null ? "-" : nightClock(Math.round(p.midpoint))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// 睡眠の時刻の中央値 1 つ分(「就寝 1時40分」)。値は "HH:MM"
function MedianTime({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums">{formatTimeOfDay(value) ?? "-"}</dd>
    </div>
  );
}
