import type { ReactNode } from "react";

// フォームの下のボタンの行。真ん中に「キャンセル、決定」の順で並べる(決定が右。マウスを右端まで動かさずに済む)。
// 削除は remove に渡し、行の左端に離して置く(キャンセルのすぐ隣に置くと、押し間違えやすい)。
// 決定は primary(真っ黒)、キャンセルや削除は secondary(グレー)。色は buttonClass で付ける
export function FormActions({ remove, children }: { remove?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="justify-self-start">{remove}</div>
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      <div />
    </div>
  );
}
