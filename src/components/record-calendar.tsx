import { RecordCalendarView } from "@/components/record-calendar-view";
import { shiftDate, todayString } from "@/lib/date";
import { buildCalendar, calendarStart } from "@/lib/record-calendar";
import { listRecordKinds } from "@/lib/record-kinds";

// 記録のカレンダー(ダッシュボードの「日々の記録」に出す)。直近 13 週ぶんの「記録した種類」を、まとめて 1 回で取って、升目にする。
// 「今日」はサーバーの日付。サーバーの明日(利用者のタイムゾーンとのずれ)に記録があれば、そのマスも出す
export async function RecordCalendar() {
  const today = todayString();
  const kinds = await listRecordKinds(calendarStart(today), shiftDate(today, 1));
  return <RecordCalendarView calendar={buildCalendar(today, kinds)} />;
}
