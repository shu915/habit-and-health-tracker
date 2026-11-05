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

// 動く帯・段階のメッセージ・経過秒数の、土台。stage: 経過秒数 → いまのメッセージ / note: 下に出す、待ち時間の説明
function Indicator({ stage, note, startSeconds = 0 }: { stage: (seconds: number) => string; note: string; startSeconds?: number }) {
  const [seconds, setSeconds] = useState(startSeconds);

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
          {stage(seconds)}
        </span>
        <span aria-hidden className="tabular-nums text-zinc-500">
          {seconds} 秒
        </span>
      </div>
      <div aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="indeterminate-bar h-full w-1/3 rounded-full bg-zinc-900 dark:bg-zinc-100" />
      </div>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  );
}

// 食事の推定(3〜15 秒)
export function ProcessingIndicator({ hasPhoto }: { hasPhoto: boolean }) {
  return <Indicator stage={(seconds) => processingStage(seconds, hasPhoto)} note="AI の推定には、10 秒ほどかかることがあります(写真は、もう少しかかります)。このままお待ちください。" />;
}

// AI レポートの作成(30 秒ほど。長いときは 1〜2 分)。割合は出さない(嘘の進捗にしない)。待っている間に出す文言を、経過時間で切り替えるだけ
export function reportProcessingStage(seconds: number): string {
  if (seconds >= 90) return "混み合っているようです。まだ続けています。最長で 2 分ほどかかります…";
  if (seconds >= 45) return "時間がかかっています。そのまま、もう少しお待ちください…";
  if (seconds >= 20) return "気づきを文章にまとめています…";
  if (seconds >= 8) return "睡眠・食事・運動のつながりを探しています…";
  if (seconds >= 3) return "日ごとの記録を読んでいます…";
  return "記録を集めて、AI に送っています…";
}

// startSeconds: すでに経過している秒数(ページを開き直したときに、続きから数える)
export function ReportProcessingIndicator({ startSeconds = 0 }: { startSeconds?: number }) {
  return <Indicator stage={reportProcessingStage} startSeconds={startSeconds} note="AI のレポートの作成には、30 秒ほどかかります(長いときは数分)。ページを閉じても、作成は続きます。あとで「AI レポート」から開けます。" />;
}
