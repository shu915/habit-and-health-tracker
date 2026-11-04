// 「次の日 →」の行き先。次の記録の日があればそこへ。無ければ、今日へ(今日より前の日にいるときだけ。今日にいるとき・未来には出さない)。
// 明日は出さない(画面の日付欄が未来を選べないのと同じ。サーバーが翌日を許すのは、タイムゾーンのずれの安全策で、入口にはしない)。
// 前の日は、記録のある日だけ(getAdjacentDays の previous をそのまま使う)
export function nextDate(date: string, recordedNext: string | null, today: string): string | null {
  if (recordedNext !== null) return recordedNext;
  return date < today ? today : null;
}
