import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import { shiftDate, todayString } from "@/lib/date";
import { listBodyMeasures } from "@/lib/days";
import { buildTrend, latestAverage, latestRecorded, MOVING_AVERAGE_DAYS, parseTrendRange, TREND_RANGES, trendDates, trendEnd, valuesByDate, type TrendPoint, type TrendRange } from "@/lib/trend";

// ダッシュボードの「体重と体脂肪率の推移」。期間は 7 / 28 / 90 日(?range=、既定 28 日)。今日までの期間(サーバーの明日に朝の記録があれば、その日まで)で、朝の記録から作る(AI は使わない)。
// 体重と体脂肪率は単位が違うので、1 つの図に重ねず、上下に 2 つ並べる。各図に、表の形の代替(読み上げ・キーボード用)を付ける。
// 「今日」はサーバーの日付(利用者のタイムゾーンと数時間ずれうる)
// 体重と体脂肪率の 2 つの図は、同じ日付の並びなので、ホバーを連動させる
const BODY_SYNC_ID = "body-trend";

export async function BodyTrend({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseTrendRange((await searchParams).range);
  const today = todayString();
  // 期間より 6 日前(移動平均の窓)から、サーバーの明日までの記録を取る。明日に朝の記録があれば、期間の末尾を明日にする(trendEnd)
  const rows = await listBodyMeasures(shiftDate(today, -(range - 1) - (MOVING_AVERAGE_DAYS - 1)), shiftDate(today, 1));
  const end = trendEnd(today, new Set(rows.filter((d) => d.morningWeightKg !== null || d.morningBodyFatPercent !== null).map((d) => d.date)));
  const dates = trendDates(end, range);
  const weight = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningWeightKg }))), 2);
  const bodyFat = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningBodyFatPercent }))), 1);

  return (
    <section aria-label="体重と体脂肪率の推移" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">体重と体脂肪率の推移</h2>
        <RangeTabs current={range} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TrendCard title="体重" unit="kg" digits={2} points={weight} />
        <TrendCard title="体脂肪率" unit="%" digits={1} points={bodyFat} />
      </div>
      <p className="text-xs text-zinc-500">
        点はその日の朝の記録、線は過去 {MOVING_AVERAGE_DAYS} 日の移動平均(記録が 2 日分以上あるとき)です。体重計の値は水分などで日々ぶれるので、傾向は線で見ます。
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

      {recorded > 0 && <TrendChart title={title} unit={unit} digits={digits} points={points} syncId={BODY_SYNC_ID} />}

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
