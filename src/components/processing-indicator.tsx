"use client";

import { useEffect, useState } from "react";

// AI の推定は 3〜15 秒ほどかかる。固まったと思わせないよう、動く帯と、段階的なメッセージ、経過秒数を出す。
// 実際の進み具合は分からないので、割合は出さない(嘘の進捗にしない)。待っている間に出す文言を、経過時間で切り替えるだけ。
// 表示している間だけ、このコンポーネントを置く(置くと数え始め、外すと止まる)。

// 経過秒数に応じた、いまの段階のメッセージ。写真があるときは、写真を読み取る段階を入れる
export function processingStage(seconds: number, hasPhoto: boolean): string {
  if (seconds >= 40) return "時間がかかっています。そのまま、もう少しお待ちください…";
  if (seconds >= 18) return "もう少しで終わります。混み合っているかもしれません…";
  if (seconds >= 10) return "栄養素を計算しています…";
  if (seconds >= 5) return "品目を見つけています…";
  if (seconds >= 2) return hasPhoto ? "写真を読み取っています…" : "食事の内容を読み取っています…";
  return "AI に送っています…";
}

export function ProcessingIndicator({ hasPhoto }: { hasPhoto: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    // role="status": メッセージが変わったときだけ読み上げられる(経過秒数は毎秒変わるので、読み上げの対象にしない)
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-4 w-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 motion-safe:animate-spin dark:border-zinc-600 dark:border-t-zinc-100" />
          {processingStage(seconds, hasPhoto)}
        </span>
        <span aria-hidden className="tabular-nums text-zinc-500">
          {seconds} 秒
        </span>
      </div>
      <div aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="indeterminate-bar h-full w-1/3 rounded-full bg-zinc-900 dark:bg-zinc-100" />
      </div>
      <p className="text-xs text-zinc-500">AI の推定には、10 秒ほどかかることがあります(写真は、もう少しかかります)。このままお待ちください。</p>
    </div>
  );
}
