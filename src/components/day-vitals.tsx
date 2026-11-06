import Link from "next/link";
import { buttonClass } from "@/components/button";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { sleepMidpoint, sleepMinutes } from "@/lib/sleep";

// 日の詳細に出す「朝の記録」: 見出しと、書く・直すボタン(何を編集するかが分かるよう、見出しの右に置く。食事・運動などの枠と同じ形)、
// 睡眠(睡眠時間と中間時刻を大きく、就寝・起床を小さく)と、朝の体の 2 つの枠。広い画面では左右に並べ、狭い画面では縦に並べる。未入力は「未入力」。
// day が null(その日の行が無い)ときは、枠は出さず、案内だけ出す
type Day = {
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  morningWeightKg: string | null;
  morningBodyFatPercent: string | null;
};

const unset = <span className="text-ink-subtle">未入力</span>;
const card = "flex flex-col gap-3 rounded-lg bg-surface-raised p-5";

export function DayVitals({ date, day }: { date: string; day: Day | null }) {
  // 朝の項目が 1 つでも入っていれば「編集」、無ければ「記録する」(食事だけの日は、朝の記録がまだ無い)
  const hasMorning = day !== null && (day.sleepBedtime !== null || day.sleepWakeTime !== null || day.morningWeightKg !== null || day.morningBodyFatPercent !== null);

  return (
    <section aria-label="朝の記録" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">朝の記録</h2>
        <Link href={`/days/${date}/edit`} className={buttonClass()}>
          {hasMorning ? "編集" : "記録する"}
        </Link>
      </div>
      {day === null ? <p className="text-sm text-ink-muted">この日の記録はまだありません。</p> : <VitalCards day={day} />}
    </section>
  );
}

function VitalCards({ day }: { day: Day }) {
  const duration = formatDuration(sleepMinutes(day.sleepBedtime, day.sleepWakeTime));
  const midpoint = formatTimeOfDay(sleepMidpoint(day.sleepBedtime, day.sleepWakeTime));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label="睡眠" className={card}>
        <h3 className="text-sm font-bold text-ink-muted">睡眠</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-ink-muted">睡眠時間</dt>
            <dd className="text-2xl font-semibold">{duration ?? unset}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">中間時刻</dt>
            <dd className="text-2xl font-semibold">{midpoint ?? unset}</dd>
          </div>
        </dl>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
          <div className="flex gap-2">
            <dt className="text-ink-muted">就寝(前の夜)</dt>
            <dd>{formatTimeOfDay(day.sleepBedtime) ?? unset}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">起床</dt>
            <dd>{formatTimeOfDay(day.sleepWakeTime) ?? unset}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="朝の体" className={card}>
        <h3 className="text-sm font-bold text-ink-muted">朝の体</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-ink-muted">体重</dt>
            <dd className="text-2xl font-semibold">{day.morningWeightKg === null ? unset : `${day.morningWeightKg} kg`}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">体脂肪率</dt>
            <dd className="text-2xl font-semibold">{day.morningBodyFatPercent === null ? unset : `${day.morningBodyFatPercent} %`}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
