// ボタンと、ボタンの見た目のリンクで使う共通の見た目。<button> にも <Link> にも className として付ける。
//   primary: 黒(主な操作。保存・編集・記録する・ログインリンクを送る)
//   secondary: 枠線だけ(補助の操作。キャンセル・提案)
const BASE = "rounded-md disabled:opacity-50";

const VARIANTS = {
  primary: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  secondary: "border border-zinc-300 dark:border-zinc-700",
} as const;

const SIZES = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-1 text-xs", // 入力欄の横に添える小さいボタン(提案)
} as const;

export function buttonClass({
  variant = "primary",
  size = "md",
}: { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES } = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}
