import { splitTimeOfDay } from "@/lib/duration";

// 睡眠時間(分)。前の夜の就寝時刻と、今朝の起床時刻("HH:MM")から計算する(列には保存しない)。
// 日をまたぐ(23:30 就寝 → 06:30 起床)かどうかは、起床から就寝を引いて、負なら 24 時間を足して決める。
// どちらかが空・読めない値のとき、同じ時刻のとき(0 分か 24 時間か決められない)は null
export function sleepMinutes(bedtime: string | null, wakeTime: string | null): number | null {
  if (bedtime === null || wakeTime === null) return null;
  const bed = splitTimeOfDay(bedtime);
  const wake = splitTimeOfDay(wakeTime);
  if (!bed || !wake) return null;

  const diff = wake.hours * 60 + wake.minutes - (bed.hours * 60 + bed.minutes);
  if (diff === 0) return null;
  return diff > 0 ? diff : diff + 24 * 60;
}

// 睡眠の中間時刻("HH:MM")。就寝と起床のちょうど真ん中(23:30 就寝 → 06:30 起床 なら 03:00)。分は四捨五入する。
// 睡眠時間が出せないとき(どちらかが空・読めない・同じ時刻)は null
export function sleepMidpoint(bedtime: string | null, wakeTime: string | null): string | null {
  const minutes = sleepMinutes(bedtime, wakeTime);
  const bed = bedtime === null ? null : splitTimeOfDay(bedtime);
  if (minutes === null || bed === null) return null;

  const mid = Math.round(bed.hours * 60 + bed.minutes + minutes / 2) % (24 * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(mid / 60))}:${pad(mid % 60)}`;
}
