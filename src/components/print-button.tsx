"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "@/components/button";

// 「PDF で保存」: ブラウザの印刷を開く(送り先に「PDF として保存」を選ぶ)。印刷用の見た目は globals.css の @media print と、各部品の print: で決めている。
// 印刷のあいだだけ、タブの題名をファイル名の案(lib/report-format.ts の reportFileName)にする(ブラウザは、題名を PDF のファイル名の初期値にする。ほかの画面と同じ題名のままだと、どれも同じ名前になる)。
// title は、PDF のファイル名の案。印刷が終わった合図(afterprint)が来ない環境でも、元の題名を失わないよう、元の題名は最初の 1 回だけ覚える。画面を離れるときも戻す
export function PrintButton({ title }: { title: string }) {
  const originalTitle = useRef<string | null>(null);

  function restore() {
    if (originalTitle.current !== null) document.title = originalTitle.current;
    originalTitle.current = null;
  }

  useEffect(() => restore, []);

  function handlePrint() {
    originalTitle.current ??= document.title;
    document.title = title;
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  }

  return (
    <button type="button" onClick={handlePrint} className={`${buttonClass({ variant: "secondary", size: "sm" })} print:hidden`}>
      PDF で保存(印刷)
    </button>
  );
}
