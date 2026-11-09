import { exerciseIntensityLabel, exerciseKcal, exerciseTypeLabel } from "@/lib/exercise";
import { ACTIVITY_LEVEL_OPTIONS } from "@/lib/profile-options";

// レポートの運動の項目に渡す、運動の要約(DB を読まない純粋な関数)。数字の計算は、コードでする(AI に数えさせない)。
// 運動は「いつもより多く動いた分」だけの記録(docs/exercise-and-diary.md)。記録が無い日は、運動していない日ではなく、「ふだんどおり」の日。
// 活動係数は、利用者が申告した「ふだんの運動の量」。AI が、追加の運動の記録の少なさを評価するかどうかの根拠にする(プロンプトの指示)

export type ExerciseEntry = { date: string; type: string; intensity: string; minutes: number };

const WEEK_DAYS = 7;

// 日付の並びのうち、条件を満たす日が連続する最長の日数
function longestRun(dates: readonly string[], test: (date: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const date of dates) {
    run = test(date) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

// 期間の日の体重(運動の消費の計算に使う)。その日が空なら、それより前の最新、それも無ければ最初に分かった値
function weightFor(date: string, weights: ReadonlyMap<string, number>, dates: readonly string[]): number | null {
  const own = weights.get(date);
  if (own !== undefined) return own;
  const index = dates.indexOf(date);
  for (let i = index - 1; i >= 0; i--) {
    const earlier = weights.get(dates[i]);
    if (earlier !== undefined) return earlier;
  }
  for (const d of dates) {
    const later = weights.get(d);
    if (later !== undefined) return later;
  }
  return null;
}

export function buildExerciseSummary(args: {
  dates: readonly string[]; // 期間の全日付(昇順)
  exercises: readonly ExerciseEntry[];
  weightByDate: ReadonlyMap<string, number>; // 朝の体重(分かる日だけ)
  activityLevel: string | null; // 期間の活動係数(日に固定した値のうち、いちばん多いもの)
}): Record<string, unknown> {
  const { dates, exercises, weightByDate, activityLevel } = args;
  const exerciseDates = new Set(exercises.map((e) => e.date));
  const hardDates = new Set(exercises.filter((e) => e.intensity === "hard").map((e) => e.date));

  const byType = new Map<string, { 回数: number; 日: Set<string>; 合計分: number }>();
  for (const e of exercises) {
    const row = byType.get(e.type) ?? { 回数: 0, 日: new Set<string>(), 合計分: 0 };
    row.回数 += 1;
    row.日.add(e.date);
    row.合計分 += e.minutes;
    byType.set(e.type, row);
  }
  const intensityCounts = new Map<string, number>();
  for (const e of exercises) intensityCounts.set(e.intensity, (intensityCounts.get(e.intensity) ?? 0) + 1);

  // 期間を 7 日ずつに区切った週(最後の週は、7 日に満たないことがある。日数を添える)
  const weeks: { 週: string; 日数: number; 運動した日数: number; 合計分: number }[] = [];
  for (let i = 0; i < dates.length; i += WEEK_DAYS) {
    const chunk = dates.slice(i, i + WEEK_DAYS);
    const inChunk = new Set(chunk);
    weeks.push({
      週: `${chunk[0]}〜${chunk[chunk.length - 1]}`,
      日数: chunk.length,
      運動した日数: chunk.filter((d) => exerciseDates.has(d)).length,
      合計分: exercises.filter((e) => inChunk.has(e.date)).reduce((n, e) => n + e.minutes, 0),
    });
  }

  // 運動で増えた消費(体重が分からず計算できない運動は、数えない)
  let burned = 0;
  let burnedCount = 0;
  for (const e of exercises) {
    const kcal = exerciseKcal(e.type, e.intensity, e.minutes, weightFor(e.date, weightByDate, dates));
    if (kcal !== null) {
      burned += kcal;
      burnedCount += 1;
    }
  }

  const level = activityLevel === null ? null : ACTIVITY_LEVEL_OPTIONS.find((o) => Number(o.value) === Number(activityLevel));

  return {
    活動係数: activityLevel === null ? null : { 値: Number(activityLevel), 意味: level ? `${level.name}(${level.detail})` : "選択肢にない値" },
    期間の日数: dates.length,
    運動の回数: exercises.length,
    運動した日数: exerciseDates.size,
    種類別: [...byType.entries()]
      .sort((a, b) => b[1].回数 - a[1].回数)
      .map(([type, row]) => ({ 種類: exerciseTypeLabel(type), 回数: row.回数, 日数: row.日.size, 合計分: row.合計分 })),
    強さ別の回数: Object.fromEntries(["light", "normal", "hard"].map((key) => [exerciseIntensityLabel(key), intensityCounts.get(key) ?? 0])),
    週ごと: weeks,
    最長の連続運動日数: longestRun(dates, (d) => exerciseDates.has(d)),
    "運動の記録がない日が続いた最長の日数": longestRun(dates, (d) => !exerciseDates.has(d)),
    ハードな運動が続いた最長の日数: longestRun(dates, (d) => hardDates.has(d)),
    運動で増えた消費の合計kcal: burnedCount === 0 ? null : burned,
    消費を計算できた運動の回数: burnedCount,
  };
}

// 期間の活動係数: 期間の日に固定した値のうち、いちばん多いもの(同数なら、新しいほう)。固定した値が1つも無ければ、今のプロフィールの値
export function periodActivityLevel(rows: readonly { date: string; profileActivityLevel: string | null }[], dates: readonly string[], profileLevel: string | null): string | null {
  const inPeriod = new Set(dates);
  const counts = new Map<string, number>();
  const lastSeen = new Map<string, string>();
  for (const row of rows) {
    if (!inPeriod.has(row.date) || row.profileActivityLevel === null) continue;
    const key = String(Number(row.profileActivityLevel));
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if ((lastSeen.get(key) ?? "") < row.date) lastSeen.set(key, row.date);
  }
  let best: string | null = null;
  for (const [key, count] of counts) {
    if (best === null) best = key;
    else {
      const bestCount = counts.get(best) ?? 0;
      if (count > bestCount || (count === bestCount && (lastSeen.get(key) ?? "") > (lastSeen.get(best) ?? ""))) best = key;
    }
  }
  return best ?? profileLevel;
}
