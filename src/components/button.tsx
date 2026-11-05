// ボタンと、ボタンの見た目のリンクで使う共通の見た目。<button> にも <Link> にも className として付ける。
//   primary: 深い緑(決定する操作だけ。保存・編集・推定する・ログインリンクを送る)
//   secondary: ベージュのグレー(弱い操作。戻る・キャンセル・提案・写真を選ぶ・外す)。白い背景でも見つけやすいよう、枠線ではなく塗る
// 色はダークモードも globals.css の変数が切り替える。角は rounded-md(8px)
// 並び: キャンセル(左)→ 決定(右)。フォームの下のボタンの行は FormActions(form-actions.tsx)を使う
const BASE = "rounded-md disabled:opacity-50";

const VARIANTS = {
  primary: "bg-accent font-semibold text-on-accent hover:bg-accent-hover",
  secondary: "bg-neutral font-medium text-ink hover:bg-neutral-hover",
} as const;

const SIZES = {
  md: "px-4 py-2 text-sm",
  sm: "px-2.5 py-1 text-xs", // 入力欄の横に添える小さいボタン(提案)
  // フォームの下のボタン(決定もキャンセルも削除もやめるも、同じ大きさ)。高さ(py-2・text-sm)も幅もそろえる。
  // 幅は、いちばん字が多い「キャンセル」(5 字)にほぼ合わせた最小の幅(min-w-24)で、「保存」のように短い字でも細くならない。
  // 色(primary / secondary)で、決定とそれ以外を見分ける
  action: "min-w-24 px-3 py-2 text-center text-sm",
} as const;

export function buttonClass({
  variant = "primary",
  size = "md",
}: { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES } = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}
