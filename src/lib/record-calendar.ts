import { shiftDate } from "@/lib/date";

// 記録のカレンダー(GitHub の草風)の計算。AI は使わない。DB は読まない(DB から取る部分は lib/record-kinds.ts)。
// 列が週(月曜始まり)、行が曜日で、1 マス = 1 日。濃さは、その日に記録した「種類」の数(0〜5): 朝の記録・食事・運動・良かったこと・今日の気づき。
// 期間は直近 53 週(約 1 年。GitHub と同じ)で固定し、狭い画面では直近 13 週(約 3 か月)だけを見せる(古い週を CSS で隠す。表示側)。
// 週の数で決めると、列がそろい、どの曜日も同じ回数ずつ入る(「1 年」「3 か月」は日数がぶれ、端の週が欠ける)。
// 今日より後の日は、記録が無ければ出さない(サーバーの日付が利用者より進んで、朝に保存した「今日」が明日になる日は、記録があればそのマスを出す)
export const CALENDAR_WEEKS = 53;
export const RECENT_WEEKS = 13; // 狭い画面で見せる週の数(末尾から)

export const RECORD_KINDS = ["morning", "meal", "exercise", "positive", "reflection"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  morning: "朝の記録",
  meal: "食事",
  exercise: "運動",
  positive: "良かったこと",
  reflection: "今日の気づき",
};
export const MAX_LEVEL = RECORD_KINDS.length;

// 月曜を 0 とした曜日(月 0 … 日 6)。カレンダー上の計算なので、タイムゾーンの影響を受けない(UTC で計算する)
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// カレンダーの最初の日: 今日を含む週の月曜から、52 週前の月曜
export function calendarStart(today: string): string {
  return shiftDate(today, -weekdayIndex(today) - 7 * (CALENDAR_WEEKS - 1));
}

export type CalendarCell = {
  date: string;
  kinds: RecordKind[]; // 記録した種類(RECORD_KINDS の順)
  level: number; // 記録した種類の数(0〜5)
  isToday: boolean;
};

export type Calendar = {
  weeks: (CalendarCell | null)[][]; // 13 週 × 7 日(月〜日)。今日より後で、記録の無い日は null
  monthLabels: (string | null)[]; // 週(列)ごとの月のラベル("10月")。月が変わる週だけ
  recordedDays: number; // 記録のある日の数(53 週ぶん)
  recentRecordedDays: number; // そのうち、直近 13 週(狭い画面で見せる範囲)の分
};

export function buildCalendar(today: string, kindsByDate: ReadonlyMap<string, readonly RecordKind[]>): Calendar {
  const start = calendarStart(today);
  let recordedDays = 0;
  let recentRecordedDays = 0;
  const weeks = Array.from({ length: CALENDAR_WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, day): CalendarCell | null => {
      const date = shiftDate(start, week * 7 + day);
      const present = kindsByDate.get(date) ?? [];
      const kinds = RECORD_KINDS.filter((kind) => present.includes(kind));
      if (date > today && kinds.length === 0) return null;
      if (kinds.length > 0) {
        recordedDays += 1;
        if (week >= CALENDAR_WEEKS - RECENT_WEEKS) recentRecordedDays += 1;
      }
      return { date, kinds, level: kinds.length, isToday: date === today };
    }),
  );

  // 月のラベル: 各週の月曜の月が、前の週と変わるところ。最初の週は、次の週がすぐ別の月になるとき(ラベルが重なる)は付けない
  const monthLabels = weeks.map((_, week) => {
    const month = Number(shiftDate(start, week * 7).slice(5, 7));
    const previous = week === 0 ? null : Number(shiftDate(start, (week - 1) * 7).slice(5, 7));
    return month === previous ? null : `${month}月`;
  });
  if (monthLabels[1] !== null) monthLabels[0] = null;

  return { weeks, monthLabels, recordedDays, recentRecordedDays };
}
