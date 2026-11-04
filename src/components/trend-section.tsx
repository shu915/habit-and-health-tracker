import Link from "next/link";
import { CalorieCard } from "@/components/calorie-card";
import type { CalorieChartPoint } from "@/components/calorie-chart";
import { SleepCard } from "@/components/sleep-card";
import { TrendCard } from "@/components/trend-card";
import { shiftDate, todayString } from "@/lib/date";
import { buildCalorieTrend, latestBefore } from "@/lib/calorie-trend";
import { getMorningWeightBefore, getStampedTargetBefore, listDayMeasures } from "@/lib/days";
import { isFinishedDay } from "@/lib/day-result";
import { listExercisesInRange } from "@/lib/exercises";
import { listDailyIntake } from "@/lib/meals";
import { getProfile } from "@/lib/profiles";
import { buildSleepTrend, buildTrend, MOVING_AVERAGE_DAYS, parseTrendRange, TREND_RANGES, trendDates, trendEnd, valuesByDate, type TrendRange } from "@/lib/trend";

// ダッシュボードの「推移」。睡眠・体重・体脂肪率・カロリーの図を並べる(各カードは sleep-card.tsx / trend-card.tsx / calorie-card.tsx。ここは、データを期間ぶんまとめて取り、カードに渡す)。期間は 7 / 28 / 90 日(?range=、既定 28 日)で、期間の切り替えは 1 つだけ(下のすべての図に効く)。
// 今日までの期間(サーバーの明日に朝の記録があれば、その日まで)で、朝の記録から作る(AI は使わない)。
// 体重と体脂肪率は単位が違うので、1 つの図に重ねず、2 つに分ける。各図に、表の形の代替(読み上げ・キーボード用)を付ける。
// 「今日」はサーバーの日付(利用者のタイムゾーンと数時間ずれうる)。どの図も同じ日付の並びなので、ホバーを連動させる
const SYNC_ID = "trend";

export async function TrendSection({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseTrendRange((await searchParams).range);
  const today = todayString();
  // 必要な記録を、期間ぶんまとめて 1 回ずつ取る(日ごとには問い合わせない)。朝の記録は、期間より 6 日前(移動平均の窓)から。どれもサーバーの明日までを取り、
  // 明日に記録(朝の記録・睡眠・食事)があれば、期間の末尾を明日にする(trendEnd)。運動の消費の体重には、期間より前の朝の体重も要る
  const from = shiftDate(today, -(range - 1) - (MOVING_AVERAGE_DAYS - 1));
  const start = shiftDate(today, -(range - 1));
  const tomorrow = shiftDate(today, 1);
  const [rows, intake, exercises, weightBeforeFrom, targetBeforeFrom, profile] = await Promise.all([
    listDayMeasures(from, tomorrow),
    listDailyIntake(start, tomorrow),
    listExercisesInRange(start, tomorrow),
    getMorningWeightBefore(from),
    getStampedTargetBefore(from),
    getProfile(),
  ]);
  const end = trendEnd(
    today,
    new Set([
      ...rows.filter((d) => d.morningWeightKg !== null || d.morningBodyFatPercent !== null || d.sleepBedtime !== null || d.sleepWakeTime !== null).map((d) => d.date),
      ...intake.map((d) => d.date),
    ]),
  );
  const dates = trendDates(end, range);
  const weight = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningWeightKg }))), 2);
  const bodyFat = buildTrend(dates, valuesByDate(rows.map((d) => ({ date: d.date, value: d.morningBodyFatPercent }))), 1);
  // 期間の最初の日より前の、いちばん新しい朝の体重と固定した目標(取った記録の中を先に見て、無ければ、さらに前の分。latestBefore)
  const priorMorningWeight = latestBefore(rows, dates[0], (d) => (d.morningWeightKg === null ? null : { weight: d.morningWeightKg, date: d.date }), weightBeforeFrom);
  const priorStampedTargetKcal = latestBefore(rows, dates[0], (d) => d.profileTargetCalories, targetBeforeFrom);
  const calories: CalorieChartPoint[] = buildCalorieTrend(dates, {
    rows: rows.map((d) => ({ date: d.date, morningWeightKg: d.morningWeightKg, stampedTargetKcal: d.profileTargetCalories })),
    intake: new Map(intake.map((d) => [d.date, d.kcal])),
    exercises,
    priorMorningWeight,
    priorStampedTargetKcal,
    profileTargetKcal: profile.targetCalories,
    isFinishedDay,
    profileWeightKg: profile.currentWeightKg,
  }).map((point) => ({ ...point, inProgress: !isFinishedDay(point.date) }));
  const sleep = buildSleepTrend(dates, new Map(rows.map((d) => [d.date, { bedtime: d.sleepBedtime, wakeTime: d.sleepWakeTime }])));

  return (
    <section aria-label="推移" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">推移</h2>
        <RangeTabs current={range} />
      </div>
      {/* 並びは、日の詳細と同じ 1 日の流れ: 睡眠 → 朝の体(体重・体脂肪率)→ 食事(カロリー)。カロリーは、体重・体脂肪率の隣 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <SleepCard points={sleep} syncId={SYNC_ID} />
        </div>
        <TrendCard title="体重" unit="kg" digits={2} points={weight} syncId={SYNC_ID} />
        <TrendCard title="体脂肪率" unit="%" digits={1} points={bodyFat} syncId={SYNC_ID} />
        <div className="md:col-span-2">
          <CalorieCard points={calories} syncId={SYNC_ID} />
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        睡眠: 帯は就寝(上)から起床(下)まで、細い線は中間時刻です。体重・体脂肪率: 点はその日の朝の記録、線は過去 {MOVING_AVERAGE_DAYS} 日の移動平均(記録が 2 日分以上あるとき)です。体重計の値は水分などで日々ぶれるので、傾向は線で見ます。カロリー: 棒は食事の合計、破線は目標となるカロリー(目標カロリー + その日の運動)で、食事の記録が無い日は棒を出しません。薄い棒は、まだ増える今日の分です。
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
