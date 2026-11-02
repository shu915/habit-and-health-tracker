// ボタンと、ボタンの見た目のリンクで使う共通の見た目。<button> にも <Link> にも className として付ける。
//   primary: 真っ黒(決定する操作だけ。保存・編集・推定する・ログインリンクを送る)
//   secondary: グレー(弱い操作。戻る・キャンセル・提案・写真を選ぶ・外す)。白い背景でも見つけやすいよう、枠線ではなく塗る
const BASE = "rounded-md disabled:opacity-50";

const VARIANTS = {
  primary: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  secondary: "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
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
