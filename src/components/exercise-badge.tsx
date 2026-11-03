import { BADGE_BASE, BADGE_TONE } from "@/components/badge-tone";
import { exerciseTimeLabel, type ExerciseTimeLabel } from "@/lib/exercise-time";

// 運動の時間帯のバッジ(午前・午後・夜)。開始時刻から計算して出す(保存しない)。
// 色は、食事のバッジと同じ定義(badge-tone.ts)を使う(午前=朝食、午後=昼食、夜=夕食)
const STYLES: Record<ExerciseTimeLabel, string> = {
  午前: BADGE_TONE.morning,
  午後: BADGE_TONE.noon,
  夜: BADGE_TONE.evening,
};

// 開始時刻が無い・読めないときは、何も出さない
export function ExerciseBadge({ time }: { time: string | null }) {
  const label = exerciseTimeLabel(time);
  if (label === null) return null;
  return <span className={`${BADGE_BASE} ${STYLES[label]}`}>{label}</span>;
}
