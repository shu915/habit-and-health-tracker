// プロフィール(profile-summary.tsx)を読み込んでいる間の、場所取りの表示。
// 目的は、読み込みが終わったときに、下の要素(AI レポートのボタンなど)が押し下げられて、画面がガクッと動く(レイアウトシフト)のを防ぐこと。
// 本物と同じ枠・余白・行の高さにして、中身だけを灰色の棒にする(文字の行 = 行の高さの入れ物に、細い棒を 1 本。折り返しは、スマホ幅だけ行を足して合わせる)。
// 点滅は、動きを減らす設定の人には出さない(motion-safe)

const BAR = "rounded bg-line motion-safe:animate-pulse";

// 文字 1 行ぶんの場所(高さは、本物の行の高さと同じ)。棒は、その中央に置く。hideFrom は、狭い幅で、折り返して増える行
// hideFrom: この幅以上では、折り返さないので、行を出さない(sm = 640px、md = 768px)
const HIDE_FROM = { sm: "sm:hidden", md: "md:hidden" } as const;
function Line({ height, width, hideFrom }: { height: "h-4" | "h-5"; width: string; hideFrom?: keyof typeof HIDE_FROM }) {
  return (
    <div className={`flex items-center ${height} ${hideFrom ? HIDE_FROM[hideFrom] : ""}`}>
      <div className={`h-3 ${width} ${BAR}`} />
    </div>
  );
}

// 本物の Item(py-2.5 と、15px の文字 = 約 22.5px)に合わせた 1 行。detail は、値の下に補足(測定日・活動係数の説明。text-xs で約 16px + 2px)が付く行
function RowSkeleton({ labelWidth, valueWidth, detail = false }: { labelWidth: string; valueWidth: string; detail?: boolean }) {
  return (
    <div data-row className={`box-content flex items-center justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0 ${detail ? "h-10.25" : "h-5.5"}`}>
      <div className={`h-3.5 ${labelWidth} ${BAR}`} />
      <div className="flex flex-col items-end gap-1">
        <div className={`h-3.5 ${valueWidth} ${BAR}`} />
        {detail && <div className={`h-3 w-28 ${BAR}`} />}
      </div>
    </div>
  );
}

// ボディデータの 7 行(性別・年齢・身長・現在の体重・体脂肪率・ウエスト・活動係数)。ウエストと活動係数は、補足が付く(ウエストは測定済みのとき)
const BODY_ROWS = [
  { label: "w-10", value: "w-14" },
  { label: "w-10", value: "w-12" },
  { label: "w-10", value: "w-16" },
  { label: "w-20", value: "w-20" },
  { label: "w-16", value: "w-14" },
  { label: "w-16", value: "w-20", detail: true },
  { label: "w-16", value: "w-24", detail: true },
] as const;
const GOAL_ROWS = [
  { label: "w-16", value: "w-16" },
  { label: "w-20", value: "w-20" },
] as const;
const SLEEP_ROWS = [
  { label: "w-24", value: "w-16" },
  { label: "w-24", value: "w-14" },
] as const;

type RowSpec = { label: string; value: string; detail?: boolean };

// 本物の RowList と同じ枠。続きの項目(moreRows)があるときは、本物と同じく、大きく間を空けて続ける
function CardSkeleton({ rows, moreRows }: { rows: readonly RowSpec[]; moreRows?: readonly RowSpec[] }) {
  const list = (specs: readonly RowSpec[]) => specs.map((spec, i) => <RowSkeleton key={i} labelWidth={spec.label} valueWidth={spec.value} detail={spec.detail} />);
  return (
    <div className="flex flex-col rounded-lg bg-surface-raised px-4 pt-4 pb-2 sm:px-5 sm:pt-4.5">
      <div className={`mb-2 h-3 w-20 ${BAR}`} />
      <div className={moreRows ? "border-b border-line-soft" : ""}>{list(rows)}</div>
      {moreRows ? <div className="mt-9">{list(moreRows)}</div> : null}
    </div>
  );
}

export function ProfileSummarySkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">プロフィールを読み込み中...</span>
      {/* 灰色の棒は見た目だけなので、読み上げの対象から外す(aria-hidden)。見出しの文字は、外さない */}
      {/* 消費カロリーのカード(本物の EnergyCard と同じ gap-1 と余白。見出し 20px・大きな数字 36px・説明の行・目標カロリー・注意書き) */}
      <div aria-hidden className="flex flex-col gap-1 rounded-lg bg-surface-raised p-4 sm:p-5">
        <Line height="h-5" width="w-44" />
        <div className={`h-9 w-36 rounded bg-line motion-safe:animate-pulse`} />
        <div>
          <Line height="h-4" width="w-full" />
          <Line height="h-4" width="w-1/3" hideFrom="sm" />
        </div>
        <div>
          {/* この説明は長いので、PC 幅(最大 896px)では 1 行、狭い幅では 2 行以上。3 行になるかは、端末で変わるので、数えない
              (スケルトンが本物より高いと、下の要素が上へずれる。低めなら、下へ少しずれるだけで済むので、低めに寄せる) */}
          <Line height="h-4" width="w-full" />
          <Line height="h-4" width="w-full" hideFrom="md" />
        </div>
        <div className="mt-1">
          <Line height="h-5" width="w-2/3" />
        </div>
        <div className="mt-1">
          <Line height="h-4" width="w-2/3" />
        </div>
      </div>
      {/* 「プロフィール」の見出しは、文字なので、そのまま出す(編集ボタン = 約 36px の場所だけ空ける) */}
      <div className="flex h-9 items-center justify-between">
        <h2 className="text-xl font-bold">プロフィール</h2>
      </div>
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton rows={BODY_ROWS} />
        <CardSkeleton rows={GOAL_ROWS} moreRows={SLEEP_ROWS} />
      </div>
    </div>
  );
}
