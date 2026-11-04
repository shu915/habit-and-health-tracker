import { exerciseKcal } from "@/lib/exercise";
import { pickWeight } from "@/lib/day-weight";

// 日ごとの「摂取カロリー」と「目標となるカロリー」の推移(棒グラフと目標の線の元)。AI は使わない。
// 目標となるカロリー = その日に固定した目標カロリー + その日の追加の運動の消費(日の詳細の栄養の比べと同じ。lib/meal-radar.ts)。
// 運動の消費は、その日の体重で計算する(その日の朝の体重 → それ以前の最新の朝の体重 → プロフィールの体重。lib/day-weight.ts)。
// 食事の記録が無い日は、摂取を 0 にせず null にする(「食べなかった」と「記録していない」を分ける)。
// 目標の基(目標カロリー): 日の行がある日は、その日に固定した値(無ければ、プロフィールの今の値で補う。日の詳細と同じ)。
// 日の行が無い日は、その日の目標のデータが無い: 過ぎた日は、それ以前でいちばん新しい固定した目標を引き継ぐ(目標は変えるまで続く。今のプロフィールで過去を書き換えない)。
// 今日・未来の日(まだ過ぎていない日)は、今のプロフィールの目標(これからの計画)。引き継ぐ元が一度も無ければ null

export type CalorieDayRow = {
  date: string;
  morningWeightKg: string | null; // その日の朝の体重
  stampedTargetKcal: number | null; // その日に固定した目標カロリー(無ければ、プロフィールの今の値で補う)
};

export type CalorieDayPoint = {
  date: string;
  intake: number | null; // 食事の kcal の合計。食事が無い日は null
  target: number | null; // 目標となるカロリー。目標カロリーが決まっていない日は null
  exerciseKcal: number; // 目標に足した、その日の運動の消費(計算できない運動は 0)
  baseKcal: number | null; // 運動を足す前の目標カロリー
};

export type CalorieInputs = {
  rows: readonly CalorieDayRow[]; // 期間の日の行(行のある日だけ)
  intake: ReadonlyMap<string, number>; // 日付 → 摂取 kcal の合計(食事のある日だけ)
  exercises: readonly { date: string; type: string; intensity: string; minutes: number }[];
  priorMorningWeight: { weight: string; date: string } | null; // 期間より前の、いちばん新しい朝の体重
  priorStampedTargetKcal: number | null; // 期間より前の、いちばん新しい固定した目標カロリー(日の行が無い日が引き継ぐ元)
  profileTargetKcal: number | null; // プロフィールの今の目標カロリー(固定した値が無い日の補い。今日・未来の日の目標)
  isFinishedDay: (date: string) => boolean; // 過ぎた日か(日の詳細と同じ判定。lib/day-result.ts)
  profileWeightKg: string | null; // プロフィールの体重(朝の体重が一度も無いときの補い)
};

// dates(古い順)の各日の点を作る
export function buildCalorieTrend(dates: readonly string[], inputs: CalorieInputs): CalorieDayPoint[] {
  const rowByDate = new Map(inputs.rows.map((row) => [row.date, row]));
  const exercisesByDate = new Map<string, CalorieInputs["exercises"][number][]>();
  for (const exercise of inputs.exercises) exercisesByDate.set(exercise.date, [...(exercisesByDate.get(exercise.date) ?? []), exercise]);

  // 古い日から順に、「それ以前の最新の朝の体重」を持ち回る(期間より前の分から始める)
  let latest = inputs.priorMorningWeight;
  let lastStamped = inputs.priorStampedTargetKcal; // 引き継ぐ、いちばん新しい固定した目標
  return dates.map((date) => {
    const row = rowByDate.get(date);
    const weight = pickWeight(row?.morningWeightKg ?? null, latest, inputs.profileWeightKg);
    if (row?.morningWeightKg != null) latest = { weight: row.morningWeightKg, date };

    const exercise = (exercisesByDate.get(date) ?? []).reduce((total, e) => total + (exerciseKcal(e.type, e.intensity, e.minutes, weight.kg) ?? 0), 0);
    // 目標の基。行がある日は固定した値(無ければ今の値)。行が無い日は、過ぎていれば引き継ぎ、過ぎていなければ今の値
    let baseKcal: number | null;
    if (row) {
      baseKcal = row.stampedTargetKcal ?? inputs.profileTargetKcal;
      if (row.stampedTargetKcal !== null) lastStamped = row.stampedTargetKcal;
    } else {
      baseKcal = inputs.isFinishedDay(date) ? lastStamped : inputs.profileTargetKcal;
    }
    return { date, intake: inputs.intake.get(date) ?? null, target: baseKcal === null ? null : baseKcal + exercise, exerciseKcal: exercise, baseKcal };
  });
}

// 縦軸の範囲と目盛り: 棒は 0 から始める(棒の長さが値なので)。いちばん大きい値(摂取・目標)が入るように、500 単位に広げる。目盛りは 500 か 1000 おき
export function calorieAxis(points: readonly CalorieDayPoint[]): { domain: [number, number]; ticks: number[] } {
  const values = points.flatMap((p) => [p.intake, p.target]).filter((v): v is number => v !== null);
  const top = Math.max(Math.ceil(Math.max(0, ...values) / 500) * 500, 1000);
  const step = top > 3000 ? 1000 : 500;
  const end = Math.ceil(top / step) * step;
  return { domain: [0, end], ticks: Array.from({ length: end / step + 1 }, (_, i) => step * i) };
}

// 期間の最初の日(firstDate)より前の、いちばん新しい値。取った記録(rows。古い順)の中に pick で値が取れる行があればその値、無ければ fallback(さらに前の分を DB から取った値)。
// 期間の末尾がサーバーの明日にずれると、最初の日も 1 日後ろにずれる。ずれて「期間の前」になった日の記録も、ここで拾う(取った記録の中を先に見るのは、そのため)
export function latestBefore<Row extends { date: string }, Value>(rows: readonly Row[], firstDate: string, pick: (row: Row) => Value | null, fallback: Value | null): Value | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date >= firstDate) continue;
    const value = pick(rows[i]);
    if (value !== null) return value;
  }
  return fallback;
}
