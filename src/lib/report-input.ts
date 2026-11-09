import { hasEnoughDays } from "@/lib/sparse-day";
import { BADGE_LABELS, BADGE_TIER_LABELS, type Badge } from "@/lib/report-badges";
import type { ReportPeriod } from "@/lib/report-period";
import { shiftDate } from "@/lib/date";
import { buildExerciseSummary } from "@/lib/report-exercise";
import { buildNutritionSummary, nutritionDayOf } from "@/lib/report-nutrition";
import { median, nightOffset } from "@/lib/trend";
import type { TrendViews } from "@/lib/trend-views";

// AI に渡す入力(docs/ai-feedback.md)を、期間の記録から組み立てる、DB を読まない純粋な関数。
// 数字の計算(集計・比較)は、コードでする(AI に足し算・割り算・相関の計算をさせない)。AI は、それを読み解いて、気づきを書く。
// 日記(良かったこと・今日の気づき・運動のメモ)と食事の名前は、ここで入力に入る。**スナップショット(保存する元の数字)には入れない**(あとで日記を消しても、レポートに残らないように)。
// null と「記録のない日」は、0 ではなく、記録していない、という意味

export type ReportSource = {
  meals: { date: string; time: string; name: string; kcal: number; proteinG: number; fatG: number; carbG: number; fiberG: number | null; saltG: number | null }[];
  exercises: { date: string; type: string; intensity: string; minutes: number; startTime: string | null; memo: string | null }[];
  positives: { date: string; body: string }[];
  reflections: { date: string; text: string }[];
};

const hm = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const clock = (minutes: number) => {
  const v = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const round1 = (value: number) => Math.round(value * 10) / 10;

export type DayRecord = {
  日付: string;
  睡眠: { 就寝: string | null; 起床: string | null; 時間分: number | null };
  体重kg: number | null;
  体脂肪率: number | null;
  食事: { 時刻: string; 名前: string; kcal: number; たんぱく質g: number; 脂質g: number; 糖質g: number; 食物繊維g: number | null; 塩分g: number | null }[];
  摂取kcal: number | null;
  // データが不足している日(食事の記録が 1 回だけ、または摂取が目標となるカロリーの 6 割未満。lib/sparse-day.ts)。記録のもれかもしれないので、摂取と差を、傾向の根拠にしない(中央値・分析材料からも外してある)
  データ不足: boolean;
  目標kcal: number | null;
  消費の目安kcal: number | null;
  摂取マイナス消費: number | null;
  運動: { 種類: string; 強さ: string; 分: number; 開始時刻: string | null; メモ: string | null }[];
  良かったこと: string[];
  今日の気づき: string | null;
};

// 期間の各日の記録(記録のある日だけ)。views の点は、dates(期間の日付)の並びと同じ
export function buildDayRecords(dates: readonly string[], views: TrendViews, source: ReportSource, recordedDates: ReadonlySet<string>): DayRecord[] {
  const indexOf = new Map(dates.map((date, i) => [date, i]));
  const group = <T extends { date: string }>(items: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  };
  const meals = group(source.meals);
  const exercises = group(source.exercises);
  const positives = group(source.positives);
  const reflections = new Map(source.reflections.map((r) => [r.date, r.text]));

  return dates.flatMap((date) => {
    if (!recordedDates.has(date)) return [];
    const i = indexOf.get(date) ?? 0;
    const sleep = views.sleep[i];
    const calories = views.calories[i];
    return [
      {
        日付: date,
        睡眠: { 就寝: sleep.bedtime, 起床: sleep.wakeTime, 時間分: sleep.minutes },
        体重kg: views.weight[i].value,
        体脂肪率: views.bodyFat[i].value,
        食事: (meals.get(date) ?? []).map((m) => ({ 時刻: m.time, 名前: m.name, kcal: m.kcal, たんぱく質g: m.proteinG, 脂質g: m.fatG, 糖質g: m.carbG, 食物繊維g: m.fiberG, 塩分g: m.saltG })),
        摂取kcal: calories.intake,
        データ不足: calories.sparse,
        目標kcal: calories.target,
        消費の目安kcal: calories.burnKcal,
        摂取マイナス消費: calories.diffKcal,
        運動: (exercises.get(date) ?? []).map((e) => ({ 種類: e.type, 強さ: e.intensity, 分: e.minutes, 開始時刻: e.startTime, メモ: e.memo })),
        良かったこと: (positives.get(date) ?? []).map((p) => p.body),
        今日の気づき: reflections.get(date) ?? null,
      },
    ];
  });
}

// ---- 分析材料: コードが計算する比較(群ごとの日数と平均) ----
type Feature = {
  date: string;
  dow: number; // 月曜 0 … 日曜 6
  intake: number | null;
  diff: number | null;
  bed: number | null; // 前の夜の就寝(18:00 を 0 とした分)
  first: number | null; // 1 食目の時刻(分)
  afterMidnightKcal: number; // 24 時以降の食事の kcal
  eveningKcal: number; // 21 時以降の食事の kcal
  gap: number | null; // 食事の最長の間隔(分。2 食以上の日)
  nextBed: number | null; // 同じ夜(その日の夜食のあと)の就寝
  nextSleep: number | null; // 翌日の睡眠時間(分)
  nextWeightChange: number | null; // 翌日の体重の変化(kg)
  exercised: boolean;
};

export function buildFeatures(records: readonly DayRecord[]): Feature[] {
  const byDate = new Map(records.map((r) => [r.日付, r]));
  return records.map((row) => {
    const times = row.食事.map((m) => hm(m.時刻)).sort((a, b) => a - b);
    const next = byDate.get(shiftDate(row.日付, 1));
    const nextKg = next?.体重kg ?? null;
    return {
      date: row.日付,
      dow: (new Date(`${row.日付}T00:00:00Z`).getUTCDay() + 6) % 7,
      intake: row.データ不足 ? null : row.摂取kcal, // データ不足の日は、摂取も差も、分析の比べに入れない
      diff: row.データ不足 ? null : row.摂取マイナス消費,
      bed: row.睡眠.就寝 === null ? null : nightOffset(row.睡眠.就寝),
      first: times.length === 0 ? null : times[0],
      afterMidnightKcal: row.食事.filter((m) => hm(m.時刻) >= 24 * 60).reduce((n, m) => n + m.kcal, 0),
      eveningKcal: row.食事.filter((m) => hm(m.時刻) >= 21 * 60).reduce((n, m) => n + m.kcal, 0),
      gap: times.length < 2 ? null : Math.max(...times.slice(1).map((t, i) => t - times[i])),
      nextBed: next?.睡眠.就寝 == null ? null : nightOffset(next.睡眠.就寝),
      nextSleep: next?.睡眠.時間分 ?? null,
      nextWeightChange: row.体重kg === null || nextKg === null ? null : Math.round((nextKg - row.体重kg) * 100) / 100,
      exercised: row.運動.length > 0,
    };
  });
}

const mean = (values: readonly (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length === 0 ? null : round1(v.reduce((a, b) => a + b, 0) / v.length);
};
const asClock = (minutes: number | null, offset = 0) => (minutes === null ? null : clock(minutes + offset));

// 群ごとの数字。keys: 出す数字(群を分けた基準と同じ数字は、比べても当たり前なので、出さない)
const METRIC_KEYS = ["摂取kcalの平均", "差の平均", "1食目の時刻の平均", "21時以降のkcalの平均", "24時以降のkcalの平均", "同じ夜の就寝時刻の平均", "翌日の睡眠時間の平均(分)", "翌日の体重の変化の平均(kg)", "運動した日数", "平日の日数"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

function metrics(group: readonly Feature[], omit: readonly MetricKey[] = []) {
  const all: Record<MetricKey, number | string | null> = {
    摂取kcalの平均: mean(group.map((f) => f.intake)),
    差の平均: mean(group.map((f) => f.diff)),
    "1食目の時刻の平均": asClock(mean(group.map((f) => f.first))),
    "21時以降のkcalの平均": mean(group.map((f) => f.eveningKcal)),
    "24時以降のkcalの平均": mean(group.map((f) => f.afterMidnightKcal)),
    同じ夜の就寝時刻の平均: asClock(mean(group.map((f) => f.nextBed)), 18 * 60),
    "翌日の睡眠時間の平均(分)": mean(group.map((f) => f.nextSleep)),
    "翌日の体重の変化の平均(kg)": mean(group.map((f) => f.nextWeightChange)),
    運動した日数: group.filter((f) => f.exercised).length,
    平日の日数: group.filter((f) => f.dow < 5).length,
  };
  return { 日数: group.length, ...Object.fromEntries(METRIC_KEYS.filter((k) => !omit.includes(k)).map((k) => [k, all[k]])) };
}

// 上位 3 分の 1 と下位 3 分の 1(各 3 日以上あるとき)
function tertiles(features: readonly Feature[], key: (f: Feature) => number | null) {
  const sorted = features.filter((f) => key(f) !== null).sort((a, b) => (key(a) ?? 0) - (key(b) ?? 0));
  const n = Math.floor(sorted.length / 3);
  return n < 3 ? null : { low: sorted.slice(0, n), high: sorted.slice(sorted.length - n) };
}

export function buildAnalysis(features: readonly Feature[]): Record<string, unknown> {
  const analysis: Record<string, unknown> = {};
  const lateBed = tertiles(features, (f) => f.bed);
  if (lateBed) analysis["前夜の就寝が遅い日(上位3分の1)と早い日(下位3分の1)"] = { 遅い日: metrics(lateBed.high), 早い日: metrics(lateBed.low) };
  const lateFirst = tertiles(features, (f) => f.first);
  if (lateFirst) analysis["1食目が遅い日(上位3分の1)と早い日(下位3分の1)"] = { 遅い日: metrics(lateFirst.high), 早い日: metrics(lateFirst.low) };
  const longGap = tertiles(features, (f) => f.gap);
  if (longGap) analysis["食事の最長の間隔が長い日と短い日(1日2食以上の日)"] = { 長い日: metrics(longGap.high), 短い日: metrics(longGap.low) };
  // 24 時以降に食べた日と食べなかった日: その日の摂取・差・夜の kcal は、食べたかどうかで決まる(定義から当然)ので出さない。夜食のあとの、睡眠と体重への影響だけを比べる
  const noIntakeMetrics: MetricKey[] = ["摂取kcalの平均", "差の平均", "21時以降のkcalの平均", "24時以降のkcalの平均"];
  const ate = features.filter((f) => f.afterMidnightKcal > 0);
  const notAte = features.filter((f) => f.intake !== null && f.afterMidnightKcal === 0);
  if (ate.length >= 3 && notAte.length >= 3) analysis["24時以降に食べた日と食べなかった日(夜食のあとの変化)"] = { 食べた日: metrics(ate, noIntakeMetrics), 食べなかった日: metrics(notAte, noIntakeMetrics) };
  const weekday = features.filter((f) => f.dow < 5);
  const weekend = features.filter((f) => f.dow >= 5);
  if (weekday.length >= 3 && weekend.length >= 3) analysis["平日と休日"] = { 平日: metrics(weekday), 休日: metrics(weekend) };
  const byDiff = features.filter((f) => f.diff !== null).sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));
  if (byDiff.length >= 10) {
    const small = byDiff.slice(0, 5);
    const large = byDiff.slice(-5);
    analysis["差がいちばん小さかった5日と大きかった5日"] = { 小さかった5日: { 日付: small.map((f) => f.date), ...metrics(small) }, 大きかった5日: { 日付: large.map((f) => f.date), ...metrics(large) } };
  }
  return analysis;
}

// ---- 集計・バッジ・全体 ----
export type ReportInput = {
  期間: { 開始: string; 終了: string; 日数: number };
  バッジ: { 項目: string; 段階: string; 収まった数: number; 判定した数: number }[];
  集計: Record<string, unknown>;
  日ごとの記録: DayRecord[];
  分析材料: Record<string, unknown>;
  記録のない日: string[];
};

export function buildReportInput(args: {
  period: ReportPeriod;
  dates: readonly string[];
  views: TrendViews;
  source: ReportSource;
  recordedDates: ReadonlySet<string>;
  badges: readonly Badge[];
  activityLevel?: string | null; // 期間の活動係数(lib/report-exercise.ts の periodActivityLevel)。運動の項目で、記録の少なさを評価するかどうかの根拠になる
}): ReportInput {
  const { period, dates, views, source, recordedDates, badges, activityLevel = null } = args;
  const records = buildDayRecords(dates, views, source, recordedDates);
  const features = buildFeatures(records);
  const sleeps = records.flatMap((r) => (r.睡眠.時間分 === null ? [] : [r.睡眠.時間分]));
  const weights = records.flatMap((r) => (r.体重kg === null ? [] : [{ 日付: r.日付, kg: r.体重kg }]));
  // 摂取の中央値と差の合計は、データ不足の日を除く(1 食しか入れていない日を、食べなかった日・減量が進んだ日と読ませない)
  const intakes = records.flatMap((r) => (r.摂取kcal === null || r.データ不足 ? [] : [r.摂取kcal]));
  // データがそろった日が足りないときは、中央値を出さない(数日の偶然を、その人の普段と読ませない。画面の摂取のカードと同じ規則)
  const finishedDays = views.calories.filter((p) => !p.inProgress).length;
  const enoughIntake = hasEnoughDays(intakes.length, finishedDays);
  const diffs = records.flatMap((r) => (r.摂取マイナス消費 === null || r.データ不足 ? [] : [r.摂取マイナス消費]));
  return {
    期間: { 開始: period.start, 終了: period.end, 日数: period.days },
    バッジ: badges.map((b) => ({ 項目: BADGE_LABELS[b.key], 段階: BADGE_TIER_LABELS[b.tier], 収まった数: b.passed, 判定した数: b.judged })),
    集計: {
      記録のある日数: records.length,
      睡眠時間の中央値分: median(sleeps),
      睡眠を記録した日数: sleeps.length,
      体重: weights.length === 0 ? null : { 最初: weights[0], 最後: weights[weights.length - 1], 記録日数: weights.length },
      摂取kcalの中央値: enoughIntake ? median(intakes) : null,
      // 2 つを分ける: AI が「食事は 25 日記録」と、データ不足の日を除いた数を、記録した日数と読み違えたため
      食事の記録がある日数: records.filter((r) => r.食事.length > 0).length,
      "食事の記録がそろった日数(データ不足の日を除く)": intakes.length,
      食事が1回だけの日数: records.filter((r) => r.食事.length === 1).length,
      データ不足の日数: records.filter((r) => r.データ不足).length,
      摂取マイナス消費の合計: diffs.length === 0 ? null : diffs.reduce((a, b) => a + b, 0),
      差を計算できた日数: diffs.length,
      運動の回数: records.reduce((n, r) => n + r.運動.length, 0),
      運動した日数: records.filter((r) => r.運動.length > 0).length,
      // 栄養素ごとの評価(たんぱく質・脂質・糖質・食物繊維・塩分。日の詳細のレーダーと同じ判定。データがそろった日だけ)。食事と栄養の項目は、これを読んで、多すぎ・少なすぎを書く
      栄養: buildNutritionSummary(records.map((r) => nutritionDayOf(r.食事, views.calories[dates.indexOf(r.日付)]))),
      // 運動の要約(種類別・強さ別・週ごと・連続・消費・活動係数)。運動の項目は、これを読んで書く
      運動: buildExerciseSummary({
        dates,
        exercises: source.exercises,
        weightByDate: new Map(records.flatMap((r) => (r.体重kg === null ? [] : [[r.日付, r.体重kg] as [string, number]]))),
        activityLevel,
      }),
    },
    日ごとの記録: records,
    分析材料: buildAnalysis(features),
    記録のない日: dates.filter((d) => !recordedDates.has(d)),
  };
}
