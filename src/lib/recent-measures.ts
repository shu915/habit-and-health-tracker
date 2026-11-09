import { median } from "@/lib/trend";

// プロフィールの「現在の体重・体脂肪率」を、直近の朝の記録から決めるための、中央値の計算(DB を読まない純粋な関数)。
// 体組成計の値は、水分や食事で日ごとにぶれる。基礎代謝や目標の計算には、1 日の値より、直近の中央値のほうが安定する。
// 平均にしないのは、極端な日(飲み会の翌朝など)に引きずられないため
export const RECENT_COUNT = 5;

export type RecentMeasure = {
  value: string; // 中央値(フォームの欄に入れる文字列)
  count: number; // 何日分から出したか(5 日に満たないときは、あるだけ)
  from: string; // いちばん古い日
  to: string; // いちばん新しい日
};

// rows: 値が入っている日(新しい順)。先頭から RECENT_COUNT 件を使う。無ければ null。
// decimals: 小数の桁(体重は 2、体脂肪率は 1。DB の桁に合わせる)
export function recentMedian(rows: readonly { date: string; value: string }[], decimals: number): RecentMeasure | null {
  const used = rows.slice(0, RECENT_COUNT);
  const numbers = used.map((row) => Number(row.value)).filter((n) => Number.isFinite(n));
  const middle = median(numbers);
  if (middle === null) return null;
  return {
    value: middle.toFixed(decimals),
    count: numbers.length,
    from: used[used.length - 1].date,
    to: used[0].date,
  };
}
