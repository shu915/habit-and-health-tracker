// アプリ全体の時計: 日本時間(Asia/Tokyo)に固定する(日本の利用者だけを想定する。2026-11-09、利用者の決定)。
// 「今日」「今の時刻」を、サーバーや端末のタイムゾーンに任せない。サーバーが UTC でも、端末が外国の時間でも、同じ日付になる。
// ブラウザ側のコードでも使う(zod などを読み込まない、小さなファイル)。DB の中の時刻の比べは、lib/meal-day-sql.ts(同じ定数を使う)
export const APP_TIME_ZONE = "Asia/Tokyo";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

// ある瞬間を、日本時間の年・月・日・時・分にする
export function zonedParts(now: Date = new Date()): ZonedParts {
  const parts = formatter.formatToParts(now);
  // 指定した項目は、必ず返る。万一欠けたら、黙って NaN の日付を作らず、止める
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = Number(parts.find((part) => part.type === type)?.value);
    if (!Number.isFinite(value)) throw new Error(`日本時間の ${type} を読めません`);
    return value;
  };
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

// 表示用の日付(日本時間の「2026/11/9」の形)。toLocaleDateString を、サーバーのタイムゾーンで呼ぶと、日本の午前に前日になる
export function formatDateInAppZone(date: Date): string {
  return date.toLocaleDateString("ja-JP", { timeZone: APP_TIME_ZONE });
}
