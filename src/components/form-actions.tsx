import type { ReactNode } from "react";

// フォームの下のボタンの行。真ん中に「キャンセル、決定」の順で並べる(決定が右。マウスを右端まで動かさずに済む)。
// 削除は remove に渡し、広い画面では行の左端に離して、狭い画面では下の行に置く(キャンセルのすぐ隣に置くと、押し間違えやすい)。
// 決定は primary(真っ黒)、キャンセルや削除は secondary(グレー)。色は buttonClass で付ける
export function FormActions({ remove, children }: { remove?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
      {/* 狭い画面では、ボタンの行を上に、削除を下の別の行に置く(横に並べると詰まって、押し間違えやすい) */}
      <div className="order-last sm:order-none sm:justify-self-start">{remove}</div>
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      <div className="hidden sm:block" />
    </div>
  );
}
