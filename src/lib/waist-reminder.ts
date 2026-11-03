// ウエストの月末の催促。ウエストはメジャーで測るので、毎日ではなく、月末に 1 回だけ更新をお願いする。
// 履歴は残さない(プロフィールの現在の値だけを上書きする)。月次レポートに使えるのは、今の値

// 月末の何日間、催促を出すか
export const WAIST_REMIND_DAYS = 3;

// 催促を出すか。today は "YYYY-MM-DD"、measuredOn は最後にウエストを保存した日("YYYY-MM-DD" か null)。
// 月末の WAIST_REMIND_DAYS 日間で、今月まだ保存していないとき(一度も保存していない場合も含む)だけ true
export function isWaistDue(today: string, measuredOn: string | null): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate(); // 翌月の 0 日 = 今月の最終日
  if (day <= daysInMonth - WAIST_REMIND_DAYS) return false;
  return measuredOn === null || measuredOn.slice(0, 7) !== today.slice(0, 7);
}
