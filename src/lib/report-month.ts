import { buildExerciseSummary, type ExerciseSummary } from "@/lib/report-exercise";
import { buildNutritionSummary, nutritionDayOf, type NutritionSummary } from "@/lib/report-nutrition";
import type { DayRecord } from "@/lib/report-input";
import { hasEnoughDays } from "@/lib/sparse-day";
import { median, sleepMedians, type SleepPoint, type TrendPoint } from "@/lib/trend";
import type { CalorieViewPoint } from "@/lib/trend-views";

// 長期レポート(四半期・年。docs/ai-feedback.md)の土台: 1 か月ぶんの、日々の記録のまとめ(DB を読まない純粋な関数。AI は使わない)。
// 長期レポートは、月ごとのまとめを N 個並べて AI に渡す(日ごとの生データや、日記の全文は渡さない)。まとめは、保存しない(毎回、日々の記録から作る)。
// 数字の計算と判定は、コードでする。データ不足の日は、摂取と差の計算から外す(1 か月のレポートと同じ規則)。
// 日記は、件数だけ(文章は入れない)。日記のテーマ(悩みから達成への変化)は、別に作って、ここに足す(いまは null = まだ取っていない)

export type MonthInput = {
  month: string; // "2026-10"
  dates: readonly string[]; // その月の日付(古い順)
  // 次の 4 つは、dates と同じ並び(日ごとの点)
  sleep: readonly SleepPoint[];
  weight: readonly TrendPoint[];
  bodyFat: readonly TrendPoint[];
  calories: readonly CalorieViewPoint[];
  records: readonly DayRecord[]; // その月の、記録のある日の記録(食事・運動・良かったこと・気づき)
  activityLevel: string | null; // その月の活動係数(日に固定した値のうち、いちばん多いもの)
};

type Measure = { 記録した日数: number; 最初の記録: { 日付: string; 値: number } | null; 最後の記録: { 日付: string; 値: number } | null; 変化: number | null; 中央値: number | null };

// 1 か月のまとめ(長期レポートに渡す形。日本語のキーは、AI が読む名前)
export type MonthSummary = {
  月: string;
  日数: number;
  記録のある日数: number;
  睡眠: { 記録した日数: number; 睡眠時間の中央値分: number | null; 就寝の中央値: string | null; 起床の中央値: string | null; 中間時刻の中央値: string | null };
  体重: Measure;
  体脂肪率: Measure;
  食事: {
    食事の記録がある日数: number;
    "食事の記録がそろった日数(データ不足の日を除く)": number;
    データ不足の日数: number;
    摂取kcalの中央値: number | null;
    差の中央値: number | null;
    差の合計: number | null;
    "24時以降に食べた日数": number;
  };
  栄養: NutritionSummary | null;
  運動: ExerciseSummary;
  日記: { 良かったことの件数: number; 良かったことを書いた日数: number; 今日の気づきを書いた日数: number; テーマ: { 悩み: string[]; 達成: string[]; 話題: string[] } | null };
};

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

// 朝の値(体重・体脂肪率)のまとめ: 最初と最後の記録、その変化、中央値
function measure(points: readonly TrendPoint[], digits: number): Measure {
  const recorded = points.flatMap((p) => (p.value === null ? [] : [{ 日付: p.date, 値: p.value }]));
  if (recorded.length === 0) return { 記録した日数: 0, 最初の記録: null, 最後の記録: null, 変化: null, 中央値: null };
  const first = recorded[0];
  const last = recorded[recorded.length - 1];
  return {
    記録した日数: recorded.length,
    最初の記録: first,
    最後の記録: last,
    変化: round(last.値 - first.値, digits),
    中央値: round(median(recorded.map((r) => r.値)) ?? 0, digits),
  };
}

const roundOrNull = (value: number | null): number | null => (value === null ? null : Math.round(value));

const hourOf = (time: string) => Number(time.slice(0, 2));

export function buildMonthSummary(input: MonthInput): MonthSummary {
  const { month, dates, sleep, weight, bodyFat, calories, records, activityLevel } = input;
  // 日ごとの点は、dates と同じ長さ・同じ並び(型では守れないので、ここで確かめる。ずれると、別の日の値を読む)
  for (const points of [sleep, weight, bodyFat, calories]) {
    if (points.length !== dates.length) throw new Error("日ごとの点の数が、dates と違います");
  }

  const sleepStats = sleepMedians(sleep);
  const finishedDays = calories.filter((p) => !p.inProgress).length;
  // 摂取と差は、データがそろった日だけ(過ぎた日で、データ不足でない)
  const usable = calories.filter((p) => !p.inProgress && !p.sparse);
  const intakes = usable.flatMap((p) => (p.intake === null ? [] : [p.intake]));
  const diffs = usable.flatMap((p) => (p.diffKcal === null ? [] : [p.diffKcal]));
  const enoughIntake = hasEnoughDays(intakes.length, finishedDays);
  const enoughDiff = hasEnoughDays(diffs.length, finishedDays);

  const weightByDate = new Map(weight.flatMap((p) => (p.value === null ? [] : [[p.date, p.value] as [string, number]])));
  const recordsByDate = new Map(records.map((r) => [r.日付, r]));

  return {
    月: month,
    日数: dates.length,
    記録のある日数: records.length,
    睡眠: {
      記録した日数: sleep.filter((p) => p.minutes !== null).length,
      睡眠時間の中央値分: sleepStats.minutes,
      就寝の中央値: sleepStats.bedtime,
      起床の中央値: sleepStats.wakeTime,
      中間時刻の中央値: sleepStats.midpoint,
    },
    体重: measure(weight, 2),
    体脂肪率: measure(bodyFat, 1),
    食事: {
      食事の記録がある日数: records.filter((r) => r.食事.length > 0).length,
      "食事の記録がそろった日数(データ不足の日を除く)": intakes.length,
      データ不足の日数: calories.filter((p) => p.sparse).length,
      // 中央値は、2 つの値の平均になると小数(2538.5)が出る。kcal は整数に丸める(AI が、小数のまま書かないように)
      摂取kcalの中央値: enoughIntake ? roundOrNull(median(intakes)) : null,
      差の中央値: enoughDiff ? roundOrNull(median(diffs)) : null,
      差の合計: diffs.length === 0 ? null : diffs.reduce((a, b) => a + b, 0),
      "24時以降に食べた日数": records.filter((r) => r.食事.some((m) => hourOf(m.時刻) >= 24)).length,
    },
    // 栄養素ごとの判定(日の詳細のレーダーと同じ基準。データがそろった日だけ)
    栄養: buildNutritionSummary(
      dates.flatMap((date, i) => {
        const record = recordsByDate.get(date);
        return record === undefined ? [] : [nutritionDayOf(record.食事, calories[i])];
      }),
    ),
    運動: buildExerciseSummary({
      dates,
      exercises: records.flatMap((r) => r.運動.map((e) => ({ date: r.日付, type: e.種類, intensity: e.強さ, minutes: e.分 }))),
      weightByDate,
      activityLevel,
    }),
    // 日記は、件数だけ(文章は入れない)
    日記: {
      良かったことの件数: records.reduce((n, r) => n + r.良かったこと.length, 0),
      良かったことを書いた日数: records.filter((r) => r.良かったこと.length > 0).length,
      今日の気づきを書いた日数: records.filter((r) => r.今日の気づき !== null).length,
      テーマ: null, // 悩みから達成への変化。別に作って足す(null = まだ取っていない)
    },
  };
}
