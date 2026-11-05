import { ReferenceLine } from "recharts";

// レポートの「注目日付」(AI が気づきの根拠にした日)の印: グラフの、その日に、細い縦の点線を引く。
// 色だけに頼らないよう、レポートの文章にも日付を書く(report-view.tsx)。ダッシュボードの図は、印なしで使う(highlightDates を渡さない)。
// Recharts は子要素を種類で見分けるので、部品ではなく、要素の配列を返す関数にしてある(図の中で {highlightLines(dates)} と呼ぶ)
export function highlightLines(dates: readonly string[]) {
  return dates.map((date) => <ReferenceLine key={`highlight-${date}`} x={date} stroke="var(--viz-text)" strokeDasharray="2 3" strokeWidth={1} strokeOpacity={0.7} ifOverflow="hidden" />);
}
