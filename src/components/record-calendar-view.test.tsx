// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildCalendar } from "@/lib/record-calendar";
import { levelColor, RecordCalendarView } from "./record-calendar-view";

afterEach(cleanup);

const today = "2026-11-05";
const calendar = buildCalendar(
  today,
  new Map([
    ["2026-11-03", ["morning", "meal"] as const],
    ["2026-11-05", ["morning", "meal", "exercise", "positive", "reflection"] as const],
  ]),
);

describe("RecordCalendarView", () => {
  it("見出しに、期間と、記録のある日の数を出す(広い画面は直近 1 年、狭い画面は直近 13 週。切り替えは CSS)", () => {
    render(<RecordCalendarView calendar={calendar} />);
    expect(screen.getByRole("heading", { name: "記録のカレンダー" })).toBeTruthy();
    expect(screen.getByText(/直近 1 年 ・ 2 日に記録/)).toBeTruthy();
    expect(screen.getByText(/直近 13 週\(約 3 か月\) ・ 2 日に記録/)).toBeTruthy();
  });

  it("古い週のマスだけ、狭い画面で隠す(hidden md:block)。直近 13 週のマスは隠さない", () => {
    render(<RecordCalendarView calendar={calendar} />);
    const hidden = (date: string) => screen.getByRole("link", { name: new RegExp(`^${date} `) }).className.includes("hidden md:block");
    expect(hidden("2025-11-03")).toBe(true); // いちばん古い週
    expect(hidden("2026-08-09")).toBe(true); // 直近 13 週の 1 日前
    expect(hidden("2026-08-10")).toBe(false); // 直近 13 週の最初の日
    expect(hidden("2026-11-05")).toBe(false);
  });

  it("各マスは、その日の詳細へのリンク。読み上げ用に、日付と記録した種類を持つ(色だけに頼らない)", () => {
    render(<RecordCalendarView calendar={calendar} />);
    const cell = screen.getByRole("link", { name: "2026-11-03 記録 2 種類(朝の記録、食事)" });
    expect(cell.getAttribute("href")).toBe("/days/2026-11-03");
    expect(screen.getByRole("link", { name: "2026-11-04 記録なし" }).getAttribute("href")).toBe("/days/2026-11-04"); // 過ぎた日で記録の無い日も、開ける
  });

  it("今日のマスには aria-current が付き、今日より後で記録の無い日のマスは出ない", () => {
    render(<RecordCalendarView calendar={calendar} />);
    expect(screen.getByRole("link", { name: /^2026-11-05 / }).getAttribute("aria-current")).toBe("date");
    expect(screen.queryByRole("link", { name: /^2026-11-06 / })).toBeNull();
  });

  it("Tab で止まるのは記録のある日のマスだけ。記録の無いマスは tabIndex=-1(押せるが、キーボードの停止位置にしない)", () => {
    render(<RecordCalendarView calendar={calendar} />);
    expect(screen.getByRole("link", { name: /^2026-11-04 / }).getAttribute("tabindex")).toBe("-1"); // 記録なし
    expect(screen.getByRole("link", { name: /^2026-11-03 / }).hasAttribute("tabindex")).toBe(false); // 記録あり
  });

  it("表の形の代替(<details>)は置かない(日々の記録の一覧と重なるため)", () => {
    render(<RecordCalendarView calendar={calendar} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("表で見る")).toBeNull();
  });
});

describe("levelColor", () => {
  it("0 は格子の灰色。1〜5 は、系列の青を面の色に混ぜた濃淡で、段階が上がるほど濃い", () => {
    expect(levelColor(0)).toBe("var(--viz-grid)");
    const percents = [1, 2, 3, 4, 5].map((level) => Number(/(\d+)%/.exec(levelColor(level))?.[1]));
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(new Set(percents).size).toBe(5);
    expect(levelColor(99)).toBe(levelColor(5)); // 5 を超えても 5 と同じ
  });
});
