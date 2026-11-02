import Link from "next/link";
import { buttonClass } from "@/components/button";

// ページの上に置く「戻る」リンク。小さな灰色の文字や、白い背景に枠線だけのボタンだと見つけにくいので、グレーの塗りのボタン(弱い操作)にして、矢印を付ける。決定する操作(保存・編集)の黒より弱くして、主な操作を目立たせる
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${buttonClass({ variant: "secondary" })} mb-3 inline-flex items-center gap-1.5`}>
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
