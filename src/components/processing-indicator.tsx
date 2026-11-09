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
    <div className="flex flex-col gap-3.5 rounded-lg bg-surface-raised p-4 sm:p-5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4 text-[15px]">
        <span className="flex min-w-0 items-center gap-2.5 font-semibold">
          <span aria-hidden className="inline-block h-[18px] w-[18px] shrink-0 rounded-full border-[2.5px] border-neutral border-t-accent motion-safe:animate-spin" />
          {stage(seconds)}
        </span>
        <span aria-hidden className="text-sm tabular-nums text-ink-muted">
          {seconds} 秒
        </span>
      </div>
      <div aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-sm bg-neutral">
        <div className="indeterminate-bar h-full w-1/3 rounded-sm bg-accent" />
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">{note}</p>
    </div>
  );
}

// 食事の推定(3〜15 秒)の、進み具合の枠。入力の下、ボタンの行のすぐ上に、最初から置いておく。
// 動き出してから出すと、画面の下に隠れて気づかれず、出たときに画面もずれる。枠は、使っていない間も、同じ大きさで(高さが変わらない)、
// 中身だけが変わる: 使っていない間は、案内の 1 行と空の帯、動いている間は、回る輪・段階のメッセージ・経過秒数・流れる帯。下の目安の説明は、いつも出す。
// role="status" の領域は、最初からあるので、メッセージが変わったときに読み上げられる(案内の行と、経過秒数は、読み上げない)
const PROCESSING_NOTE = "AI の推定には、10 秒ほどかかることがあります(写真は、もう少しかかります)。";

export function ProcessingPanel({ active, hasPhoto }: { active: boolean; hasPhoto: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-raised p-4 sm:p-5">
      <div role="status" aria-live="polite" className="min-h-6 text-[15px]">
        {active ? (
          <ProcessingLine hasPhoto={hasPhoto} />
        ) : (
          <span aria-hidden className="text-ink-muted">
            推定すると、ここに進み具合が出ます
          </span>
        )}
      </div>
      <div aria-hidden className="relative h-1.5 w-full overflow-hidden rounded-sm bg-neutral">
        {active && <div className="indeterminate-bar h-full w-1/3 rounded-sm bg-accent" />}
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">{PROCESSING_NOTE}</p>
    </div>
  );
}

// 動いている間だけ置く(置くと数え始め、外すと止まる)
function ProcessingLine({ hasPhoto }: { hasPhoto: boolean }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-2.5 font-semibold">
        <span aria-hidden className="inline-block h-[18px] w-[18px] shrink-0 rounded-full border-[2.5px] border-neutral border-t-accent motion-safe:animate-spin" />
        {processingStage(seconds, hasPhoto)}
      </span>
      <span aria-hidden className="text-sm tabular-nums text-ink-muted">
        {seconds} 秒
      </span>
    </div>
  );
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
