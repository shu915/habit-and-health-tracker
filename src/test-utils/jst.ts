// テスト用: 日本時間の日時から、その瞬間の Date を作る。テストを動かす機械のタイムゾーン(CI は UTC、手元は JST)に左右されない。
// アプリの時計は日本時間に固定してある(lib/time-zone.ts)ので、テストの「今」も、日本時間で書く
export const jst = (year: number, month: number, day: number, hour = 0, minute = 0): Date => new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
