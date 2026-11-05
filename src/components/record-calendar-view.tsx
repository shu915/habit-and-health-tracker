import Link from "next/link";
import { CALENDAR_WEEKS, MAX_LEVEL, RECENT_WEEKS, RECORD_KIND_LABELS, type Calendar } from "@/lib/record-calendar";

// 記録のカレンダー(GitHub の草風)の表示。列が週(月曜始まり)、行が曜日、1 マス = 1 日で、記録した種類が多い日ほど濃い(青の 1 色の濃淡)。
// 広い画面(md 以上)は直近 53 週(約 1 年)、狭い画面は直近 13 週(約 3 か月): 古い週を CSS(hidden md:block)で隠すだけで、JavaScript は使わない。
// 隠した要素は、グリッドの自動配置(列方向)で飛ばされるので、列がずれない。マスの大きさは列の幅(1fr)で決まり、画面の幅に合わせて変わる(横スクロールは出ない)。
// 各マスは、その日の詳細へのリンク(ホバーで、日付と記録した種類を出す)。キーボードの Tab で止まるのは、記録のある日のマスだけ(記録の無いマスは tabIndex=-1。371 個を通らずに済む)。サーバーだけで描く。
// 記録の無い日は薄いグレー(0 にした、ではなく「記録が無い」)。今日は枠で示す(box-shadow。インラインの outline は、キーボードのフォーカスの枠を上書きして消すため使わない)。
// 表の形の代替は置かない(日々の記録の一覧が、記録のある日の表の役目をする)
const WEEKDAY_LABELS = ["月", "", "水", "", "金", "", ""]; // 全部の曜日を出すと詰まるので、1 つおき

// 濃さ(0〜5)の色。0 は格子の灰色。1〜5 は系列の青を、面の色に混ぜて濃くする(ダークでも面の色が変わるので破綻しない)
export function levelColor(level: number): string {
  if (level <= 0) return "var(--viz-grid)";
  const percent = [25, 40, 55, 75, 100][Math.min(level, MAX_LEVEL) - 1];
  return `color-mix(in srgb, var(--viz-series) ${percent}%, var(--viz-surface))`;
}

const describe = (date: string, kinds: readonly string[]) => (kinds.length === 0 ? `${date} 記録なし` : `${date} 記録 ${kinds.length} 種類(${kinds.join("、")})`);

export function RecordCalendarView({ calendar }: { calendar: Calendar }) {
  // 狭い画面で隠す週(古い週)の要素に付ける
  const hiddenOnNarrow = (week: number) => (week < CALENDAR_WEEKS - RECENT_WEEKS ? "hidden md:block" : "");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-base font-semibold">記録のカレンダー</h3>
        <p className="text-sm text-zinc-500">
          <span className="md:hidden">
            直近 {RECENT_WEEKS} 週(約 3 か月) ・ {calendar.recentRecordedDays} 日に記録
          </span>
          <span className="hidden md:inline">直近 1 年 ・ {calendar.recordedDays} 日に記録</span>
        </p>
      </div>

      {/* 1 列 = 8 要素(月のラベル 1 + 曜日 7)を、列方向に並べる。最初の列は曜日のラベル */}
      <div className="grid grid-flow-col grid-cols-[auto] grid-rows-[auto_repeat(7,auto)] auto-cols-[minmax(0,1fr)] gap-[2px] text-xs text-zinc-500">
        <span aria-hidden />
        {WEEKDAY_LABELS.map((label, day) => (
          <span key={day} className="self-center pr-1 leading-none">
            {label}
          </span>
        ))}
        {calendar.weeks.flatMap((week, weekIndex) => [
          <span key={`m${weekIndex}`} className={`whitespace-nowrap leading-none ${hiddenOnNarrow(weekIndex)}`}>
            {calendar.monthLabels[weekIndex]}
          </span>,
          ...week.map((cell, day) => {
            if (cell === null) return <span key={`e${weekIndex}-${day}`} aria-hidden className={hiddenOnNarrow(weekIndex)} />; // 今日より後で記録の無い日。配置を保つ空き
            const label = describe(
              cell.date,
              cell.kinds.map((kind) => RECORD_KIND_LABELS[kind]),
            );
            return (
              <Link
                key={cell.date}
                href={`/days/${cell.date}`}
                prefetch={false} // 371 個のリンクを、まとめて先読みしない
                aria-label={label}
                aria-current={cell.isToday ? "date" : undefined}
                tabIndex={cell.level === 0 ? -1 : undefined} // 記録の無いマスは Tab の停止位置にしない(広い画面で 371 個を通らずに済む。マウスでは押せる)
                title={label}
                className={`aspect-square rounded-sm ${hiddenOnNarrow(weekIndex)}`}
                style={{ background: levelColor(cell.level), boxShadow: cell.isToday ? "0 0 0 1px var(--viz-surface), 0 0 0 2.5px var(--viz-text)" : undefined }}
              />
            );
          }),
        ])}
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
        記録した種類が
        <span className="flex items-center gap-1" aria-hidden>
          少ない
          {Array.from({ length: MAX_LEVEL + 1 }, (_, level) => (
            <span key={level} className="inline-block h-3 w-3 rounded-sm" style={{ background: levelColor(level) }} />
          ))}
          多い
        </span>
        (朝の記録・食事・運動・良かったこと・今日の気づきの 0〜{MAX_LEVEL})。マスを押すと、その日の詳細を開きます。
      </p>
    </div>
  );
}
