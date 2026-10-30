// 睡眠時間などの「長さ」を、DB の分(整数)と、画面の「7時間30分」のあいだで変換する。
// DB には分のまま保存し、画面に出すとき・フォームから受け取るときだけ変換する

// 450 → { hours: 7, minutes: 30 }
export function splitMinutes(totalMinutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

// 450 → "7時間30分"、480 → "8時間"、45 → "45分"。未入力は null
export function formatDuration(totalMinutes: number | null): string | null {
  if (totalMinutes === null) return null;
  const { hours, minutes } = splitMinutes(totalMinutes);
  if (hours === 0) return `${minutes}分`;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
}

// フォームの「時間」「分」の欄(文字列)を、サーバーに送る分(文字列)にする。
//  - どちらも空なら "" (未入力)
//  - 片方だけ空なら、空のほうを 0 として扱う("7" 時間 + 空 → 420)
//  - 数字でないものがあれば、そのまま ":" でつないだ文字列を返す(サーバーの検証が「整数ではない」として拒否する)
export function joinMinutes(hours: string, minutes: string): string {
  const h = hours.trim();
  const m = minutes.trim();
  if (h === "" && m === "") return "";
  if (!/^\d*$/.test(h) || !/^\d*$/.test(m)) return `${h}:${m}`;
  return String(Number(h || "0") * 60 + Number(m || "0"));
}

// --- 時刻("03:15")---
// 睡眠の中間時刻など、1 日の中の時刻。DB には "HH:MM" で保存し、画面では「時」「分」の 2 つの欄で入力する

// "03:15" → { hours: 3, minutes: 15 }。形が違えば null
export function splitTimeOfDay(value: string): { hours: number; minutes: number } | null {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
}

// "03:15" → "3時15分"、"23:00" → "23時"。未入力・形が違う値は null
export function formatTimeOfDay(value: string | null): string | null {
  if (value === null) return null;
  const parts = splitTimeOfDay(value);
  if (!parts) return value;
  return parts.minutes === 0 ? `${parts.hours}時` : `${parts.hours}時${parts.minutes}分`;
}

// フォームの「時」「分」の欄(文字列)を、サーバーに送る "HH:MM" にする。
//  - どちらも空なら "" (未入力)。片方だけ空なら、空のほうを 0 として扱う
//  - 数字でないもの・範囲外("24" 時や "60" 分)は、サーバーの検証が拒否できる形のまま返す
export function joinTimeOfDay(hours: string, minutes: string): string {
  const h = hours.trim();
  const m = minutes.trim();
  if (h === "" && m === "") return "";
  if (!/^\d*$/.test(h) || !/^\d*$/.test(m)) return `${h}:${m}`;
  return `${(h || "0").padStart(2, "0")}:${(m || "0").padStart(2, "0")}`;
}
