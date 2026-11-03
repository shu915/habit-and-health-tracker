import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { sleepMidpoint, sleepMinutes } from "@/lib/sleep";

// 日の詳細に出す、朝の記録の 2 つの枠: 睡眠(睡眠時間と中間時刻を大きく、就寝・起床を小さく)と、朝の体。
// 広い画面では左右に並べ、狭い画面では縦に並べる。未入力は「未入力」
type Day = {
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  morningWeightKg: string | null;
  morningBodyFatPercent: string | null;
};

const unset = <span className="text-zinc-400">未入力</span>;
const card = "flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";

export function DayVitals({ day }: { day: Day }) {
  const duration = formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime));
  const midpoint = formatTimeOfDay(sleepMidpoint(day.sleepBedtime, day.sleepWakeTime));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="睡眠" className={card}>
        <h2 className="text-sm font-medium text-zinc-500">睡眠</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-zinc-500">睡眠時間</dt>
            <dd className="text-2xl font-semibold">{duration ?? unset}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">中間時刻</dt>
            <dd className="text-2xl font-semibold">{midpoint ?? unset}</dd>
          </div>
        </dl>
        <dl className="flex gap-6 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex gap-2">
            <dt className="text-zinc-500">就寝(前の夜)</dt>
            <dd>{formatTimeOfDay(day.sleepBedtime) ?? unset}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-zinc-500">起床</dt>
            <dd>{formatTimeOfDay(day.sleepWakeTime) ?? unset}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="朝の体" className={card}>
        <h2 className="text-sm font-medium text-zinc-500">朝の体</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-zinc-500">体重</dt>
            <dd className="text-2xl font-semibold">{day.morningWeightKg === null ? unset : `${day.morningWeightKg} kg`}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">体脂肪率</dt>
            <dd className="text-2xl font-semibold">{day.morningBodyFatPercent === null ? unset : `${day.morningBodyFatPercent} %`}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
