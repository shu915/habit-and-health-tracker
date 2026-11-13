"use client";

import { useEffect, useState } from "react";

// AI の推定は、文章だけなら 3〜15 秒ほど、写真つき(最大 4 枚)だと、その倍近くかかる(本番で、写真 4 枚は、1 分近くかかることがあった)。固まったと思わせないよう、動く帯と、段階的なメッセージ、経過秒数を出す。
// 実際の進み具合は分からないので、割合は出さない(嘘の進捗にしない)。待っている間に出す文言を、経過時間で切り替えるだけ。
// 表示している間だけ、このコンポーネントを置く(置くと数え始め、外すと止まる)。

// 経過秒数に応じた、いまの段階のメッセージ。写真があるときは、写真を読み取る段階を入れ、時間の進みを半分にみなす(切り替わりが 2 倍遅い。
// 「もう少しで終わります」が、まだ半ばで出て、嘘にならないように)
export function processingStage(rawSeconds: number, hasPhoto: boolean): string {
  const seconds = hasPhoto ? rawSeconds / 2 : rawSeconds;
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

// 食事の推定(文章だけなら 3〜15 秒、写真つきは 1 分近くまで)の、進み具合の枠。入力の下、ボタンの行のすぐ上に、最初から置いておく。
// 動き出してから出すと、画面の下に隠れて気づかれず、出たときに画面もずれる。枠は、使っていない間も、同じ大きさで(高さが変わらない)、
// 中身だけが変わる: 使っていない間は、案内の 1 行と空の帯、動いている間は、回る輪・段階のメッセージ・経過秒数・流れる帯。下の目安の説明は、いつも出す。
// role="status" の領域は、最初からあるので、メッセージが変わったときに読み上げられる(案内の行と、経過秒数は、読み上げない)
const PROCESSING_NOTE = "AI の推定には、10 秒ほどかかることがあります(写真は、もう少しかかります)。";
const PROCESSING_NOTE_WITH_PHOTO = "写真つきの推定には、枚数が多いほど時間がかかり、1 分近くかかることもあります。そのまま、お待ちください。";

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
      <p className="text-xs leading-relaxed text-ink-muted">{hasPhoto ? PROCESSING_NOTE_WITH_PHOTO : PROCESSING_NOTE}</p>
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

// AI レポートの作成(30 秒〜1 分ほど。年次は 1 分ほどかかった。長いときは 2 分以上)。割合は出さない(嘘の進捗にしない)。待っている間に出す文言を、経過時間で切り替えるだけ
export function reportProcessingStage(seconds: number): string {
  if (seconds >= 120) return "混み合っているようです。まだ続けています。数分かかることもあります…";
  if (seconds >= 75) return "時間がかかっています。そのまま、もう少しお待ちください…";
  if (seconds >= 35) return "気づきを文章にまとめています…";
  if (seconds >= 15) return "睡眠・食事・運動のつながりを探しています…";
  if (seconds >= 5) return "日ごとの記録を読んでいます…";
  return "記録を集めて、AI に送っています…";
}

// startSeconds: すでに経過している秒数(ページを開き直したときに、続きから数える)
export function ReportProcessingIndicator({ startSeconds = 0 }: { startSeconds?: number }) {
  return <Indicator stage={reportProcessingStage} startSeconds={startSeconds} note="AI のレポートの作成には、30 秒〜1 分ほどかかります(年次や、記録が多いときは、もう少し)。ページを閉じても、作成は続きます。あとで「AI レポート」から開けます。" />;
}
