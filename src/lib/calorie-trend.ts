import { exerciseKcal } from "@/lib/exercise";
import { pickMeasure, pickWeight } from "@/lib/day-weight";
import { energyOverview } from "@/lib/energy-overview";
import { hasEnoughDays, neededValidDays } from "@/lib/sparse-day";
import { median } from "@/lib/trend";

// 日ごとの「摂取カロリー」と「目標となるカロリー」の推移(棒グラフと目標の線の元)。AI は使わない。
// 目標となるカロリー = その日に固定した目標カロリー + その日の追加の運動の消費(日の詳細の栄養の比べと同じ。lib/meal-radar.ts)。
// 運動の消費は、その日の体重で計算する(その日の朝の体重 → それ以前の最新の朝の体重 → プロフィールの体重。lib/day-weight.ts)。
// 食事の記録が無い日は、摂取を 0 にせず null にする(「食べなかった」と「記録していない」を分ける)。
// 目標の基(目標カロリー): 日の行がある日は、その日に固定した値(無ければ、プロフィールの今の値で補う。日の詳細と同じ)。
// 日の行が無い日は、その日の目標のデータが無い: 過ぎた日は、それ以前でいちばん新しい固定した目標を引き継ぐ(目標は変えるまで続く。今のプロフィールで過去を書き換えない)。
// 今日・未来の日(まだ過ぎていない日)は、今のプロフィールの目標(これからの計画)。引き継ぐ元が一度も無ければ null
// 消費の目安と差(摂取 − 消費の目安): 日の詳細の「この日の結果」と同じ計算(基礎代謝 × その日に固定した活動係数 + その日の運動の消費。体重・体脂肪率は、その日の朝 → それ以前の最新 → プロフィール)。
// 食事の記録が無い日と、消費が出せない日(体重などが足りない)は、差を null にする(記録が無い日を大きな赤字に見せない)。食事のある日は日の行が必ずあるので、活動係数の引き継ぎは要らない

export type CalorieDayRow = {
  date: string;
  morningWeightKg: string | null; // その日の朝の体重
  stampedTargetKcal: number | null; // その日に固定した目標カロリー(無ければ、プロフィールの今の値で補う)
  morningBodyFatPercent?: string | null; // その日の朝の体脂肪率(消費の目安に使う)
  stampedActivityLevel?: string | null; // その日に固定した活動係数(無ければ、プロフィールの今の値で補う)
};

// 消費の目安の計算に要る、プロフィールの値と、期間より前の体脂肪率(渡さなければ、消費の目安と差は出さない)
export type CalorieEnergyInputs = {
  gender: string | null;
  age: number | null;
  heightCm: string | null;
  profileBodyFatPercent: string | null;
  profileActivityLevel: string | null;
  priorMorningBodyFat: { weight: string; date: string } | null; // 期間より前の、いちばん新しい朝の体脂肪率
};

export type CalorieDayPoint = {
  date: string;
  intake: number | null; // 食事の kcal の合計。食事が無い日は null
  target: number | null; // 目標となるカロリー。目標カロリーが決まっていない日は null
  exerciseKcal: number; // 目標に足した、その日の運動の消費(計算できない運動は 0)
  baseKcal: number | null; // 運動を足す前の目標カロリー
  burnKcal: number | null; // 消費の目安(1 日の消費 + その日の運動)。energy が無い・計算できない日は null
  diffKcal: number | null; // 摂取 − 消費の目安。食事が無い日・消費が出せない日は null
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
  energy?: CalorieEnergyInputs;
};

// dates(古い順)の各日の点を作る
export function buildCalorieTrend(dates: readonly string[], inputs: CalorieInputs): CalorieDayPoint[] {
  const rowByDate = new Map(inputs.rows.map((row) => [row.date, row]));
  const exercisesByDate = new Map<string, CalorieInputs["exercises"][number][]>();
  for (const exercise of inputs.exercises) exercisesByDate.set(exercise.date, [...(exercisesByDate.get(exercise.date) ?? []), exercise]);

  // 古い日から順に、「それ以前の最新の朝の体重」を持ち回る(期間より前の分から始める)
  let latest = inputs.priorMorningWeight;
  let lastStamped = inputs.priorStampedTargetKcal; // 引き継ぐ、いちばん新しい固定した目標
  let latestBodyFat = inputs.energy?.priorMorningBodyFat ?? null;
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

    const intake = inputs.intake.get(date) ?? null;
    let burnKcal: number | null = null;
    const energy = inputs.energy;
    if (energy) {
      const bodyFat = pickMeasure(row?.morningBodyFatPercent ?? null, latestBodyFat, energy.profileBodyFatPercent);
      const overview = energyOverview({
        gender: energy.gender,
        age: energy.age,
        heightCm: energy.heightCm,
        currentWeightKg: weight.kg === null ? null : String(weight.kg),
        currentBodyFatPercent: bodyFat.value === null ? null : String(bodyFat.value),
        activityLevel: row?.stampedActivityLevel ?? energy.profileActivityLevel,
        targetCalories: null,
      });
      if (overview.kind === "ready") burnKcal = overview.tdeeKcal + exercise;
      if (row?.morningBodyFatPercent != null) latestBodyFat = { weight: row.morningBodyFatPercent, date };
    }
    return {
      date,
      intake,
      target: baseKcal === null ? null : baseKcal + exercise,
      exerciseKcal: exercise,
      baseKcal,
      burnKcal,
      diffKcal: intake === null || burnKcal === null ? null : intake - burnKcal,
    };
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

// 体脂肪 1kg あたりのエネルギー(一般的な目安の約 7,200 kcal)。差の合計を体重に換算して見せるための定数で、個人差がある
export const KCAL_PER_KG = 7200;

// 体重への換算を出すのに要る、差を計算できた日(過ぎた日)の最低日数。これより少ないと、記録が数日抜けただけで合計が大きく変わり、換算した kg が「たくさん痩せた」ように見えるため出さない
export const MIN_DAYS_FOR_KG = 7;

// 摂取カロリーの中央値(見出し・読み上げ用)。過ぎた日で、食事の記録があり、データ不足(sparse)でない日だけで出す。
// データがそろった日が足りないとき(最低 3 日、かつ、過ぎた日の 3 分の 1 以上)は、不正確な値を出さないよう、median を null にする
export function intakeSummary(points: readonly { intake: number | null; inProgress: boolean; sparse?: boolean }[]): { median: number | null; validDays: number; neededDays: number; enough: boolean; sparseDays: number } {
  const finishedDays = points.filter((p) => !p.inProgress).length;
  const neededDays = neededValidDays(finishedDays);
  const valid = points.flatMap((p) => (p.intake === null || p.inProgress || p.sparse === true ? [] : [p.intake]));
  const enough = hasEnoughDays(valid.length, finishedDays);
  return { median: enough ? median(valid) : null, validDays: valid.length, neededDays, enough, sparseDays: points.filter((p) => !p.inProgress && p.sparse === true && p.intake !== null).length };
}

// 差の棒のカードの見出し: 過ぎた日(inProgress でない日)で、差を計算できた日の「合計」と「中央値」。書きかけの日は、まだ増える値なので数えない。
// 合計は、差を計算できた日だけを足す(食事の記録が無い日は入らない)ので、記録が抜けた日が多いと小さく出る。kg は合計を KCAL_PER_KG で割った目安で、日数が MIN_DAYS_FOR_KG 未満なら null。計算できた日が無ければ全体が null
// データが不足している日(sparse。食事の記録が 1 回だけ、または摂取が目標の 6 割未満)は、合計・中央値・体重の換算から外し、その日数を excluded で返す(1 食しか入れていない日を、ダイエットが進んだ日と誤解させない)
export function balanceSummary(points: readonly (CalorieDayPoint & { inProgress: boolean; sparse?: boolean })[]): { days: number; sumKcal: number; medianKcal: number; kg: number | null; excluded: number; enough: boolean; neededDays: number } | null {
  const excluded = points.filter((p) => !p.inProgress && p.sparse === true && p.diffKcal !== null).length;
  const diffs = points.flatMap((p) => (p.inProgress || p.sparse === true || p.diffKcal === null ? [] : [p.diffKcal]));
  const middle = median(diffs);
  if (middle === null) return null;
  const sumKcal = diffs.reduce((total, d) => total + d, 0);
  // データがそろった日が足りないとき(enough が false)は、合計・中央値・体重の換算を、画面に出さない(数字は、テストと読み上げのために残す)
  const neededDays = neededValidDays(points.filter((p) => !p.inProgress).length);
  return { days: diffs.length, sumKcal, medianKcal: Math.round(middle), kg: diffs.length >= MIN_DAYS_FOR_KG ? sumKcal / KCAL_PER_KG : null, excluded, enough: diffs.length >= neededDays, neededDays };
}

// 差の棒の縦軸: 0 を中心に上下対称(500 単位に広げる。目盛りは 500 か 1000 おき)。棒は 0 から伸びるので、0 は必ず入る
export function balanceAxis(points: readonly CalorieDayPoint[]): { domain: [number, number]; ticks: number[] } {
  const values = points.flatMap((p) => (p.diffKcal === null ? [] : [Math.abs(p.diffKcal)]));
  const top = Math.max(Math.ceil(Math.max(0, ...values) / 500) * 500, 1000);
  const step = top > 3000 ? 1000 : 500;
  const end = Math.ceil(top / step) * step;
  return { domain: [-end, end], ticks: Array.from({ length: (2 * end) / step + 1 }, (_, i) => -end + step * i) };
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
