// ダッシュボードの一覧のページ分け。記録のある日だけを、新しい日から 14 件ずつ出す(記録の無い日の行は出さない。新しい日は日付欄から作る)。
// 14 件 = 2 週間ぶん。1 行を大きくしても縦に長くなりすぎない
export const DAYS_PER_PAGE = 14;

// URL の ?page= の値を、1 以上の整数にする。読めない値・7 桁以上は 1(範囲外の大きな値の寄せ先は、呼び出し側が最後のページに丸める)
export function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}

// 最後のページ(記録の件数から決まる)。記録が無くても 1
export function lastPage(total: number): number {
  return Math.max(1, Math.ceil(total / DAYS_PER_PAGE));
}

// 最後のページより先を指していたら、最後のページに寄せる
export function clampPage(page: number, last: number): number {
  return Math.min(page, last);
}
