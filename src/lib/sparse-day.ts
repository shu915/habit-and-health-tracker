// 「データが不足している日」の判定。食事の記録がそろっていない(もれている)可能性が高い日を見分けて、
// 摂取の中央値・差の合計と体重の換算・バッジの判定から外す(1 食しか入れていない日を、ダイエットが進んだ日と誤解させないため)。
// 純粋な関数(DB にも画面にも触れない)。過ぎた日(03:00 を過ぎて、書きかけでない日)にだけ使う: 今日は、これから記録が増える
export const SPARSE_MIN_MEALS = 2; // 食事が 2 回あれば、ありうる(朝食抜きなど)。1 回だけは、もれの可能性が高い
export const SPARSE_LOW_INTAKE_RATIO = 0.6; // 摂取が、目標となるカロリーの 6 割に届かない日(本当に少なく食べた日も、ここに入りうる。断定せず、「もれていませんか」と尋ねる)

export type SparseReason = "one-meal" | "low-intake";

export function sparseReason({ mealCount, intakeKcal, targetKcal }: { mealCount: number; intakeKcal: number | null; targetKcal: number | null }): SparseReason | null {
  if (mealCount === 0 || intakeKcal === null) return null; // 記録が無い日は、別(「食事の記録なし」)。ここでは、記録がある日の話
  if (mealCount < SPARSE_MIN_MEALS) return "one-meal";
  if (targetKcal !== null && targetKcal > 0 && intakeKcal / targetKcal < SPARSE_LOW_INTAKE_RATIO) return "low-intake";
  return null;
}

export const isSparseDay = (input: Parameters<typeof sparseReason>[0]): boolean => sparseReason(input) !== null;

// 画面に出す理由(責めない言い方)
export const SPARSE_REASON_TEXT: Record<SparseReason, string> = {
  "one-meal": "食事の記録が 1 回だけです",
  "low-intake": "摂取が目標となるカロリーの 6 割に届きません",
};

// データ不足と見る条件の、ひとことの説明(グラフの注記用)
export const SPARSE_CONDITION = "食事の記録が 1 回だけ、または摂取が目標となるカロリーの 6 割未満";

// 集計(中央値・合計・体重の換算)を出すのに要る、データがそろった日(データ不足でない日)の数。
// 少ない日数の集計は、数日の偶然で大きく動き、不正確な値を、確かなものに見せてしまうので、足りないときは、出さない(2026-11-06、利用者の決定)。
// 最低 3 日、かつ、期間の過ぎた日の 3 分の 1 以上。28 日なら 10 日、90 日なら 30 日、7 日なら 3 日
export const MIN_VALID_DAYS = 3;
export const MIN_VALID_COVERAGE = 1 / 3;

export function neededValidDays(finishedDays: number): number {
  return Math.max(MIN_VALID_DAYS, Math.ceil(finishedDays * MIN_VALID_COVERAGE));
}

export const hasEnoughDays = (validDays: number, finishedDays: number): boolean => validDays >= neededValidDays(finishedDays);
