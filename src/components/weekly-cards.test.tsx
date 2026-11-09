// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExerciseWeeklyCard, IntakeWeeklyCard, SleepWeeklyCard, WeeklyBandCard } from "./weekly-cards";
import { WEEKLY_CHART_HEIGHT } from "./weekly-chart";
import { weeklyAxis } from "@/lib/weekly-chart-data";
import type { WeekPoint } from "@/lib/weekly-points";

afterEach(cleanup);

const week = (weekStart: string, median: number | null, low: number | null = median, high: number | null = median, recorded = median === null ? 0 : 5): WeekPoint => ({
  weekStart,
  label: `${Number(weekStart.slice(5, 7))}/${Number(weekStart.slice(8, 10))}`,
  recorded,
  median,
  low,
  high,
});

describe("weeklyAxis", () => {
  it("目盛りは 4 つで、刻みの倍数。値の幅に余白を足す", () => {
    const axis = weeklyAxis([69.2, 70.8], 1);
    expect(axis.ticks).toHaveLength(4);
    expect(axis.domain).toEqual([axis.ticks[0], axis.ticks[3]]);
    expect(axis.domain[0]).toBeLessThanOrEqual(69.2);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(70.8);
    expect(axis.ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it("棒用は 0 から始める。値が無ければ、既定の目盛り", () => {
    expect(weeklyAxis([1800, 2300], 500, { floor0: true }).ticks[0]).toBe(0);
    expect(weeklyAxis([], 1).ticks).toEqual([0, 1, 2, 3]);
  });
});

describe("WeeklyBandCard", () => {
  const points = [week("2026-07-06", 70, 69.5, 70.5), week("2026-07-13", null), week("2026-07-20", 69, 68.5, 69.5)];

  it("見出しに、最新の週の中央値と、最初の週の値。図には、読み上げ用の説明と、固定の高さ。1 本 = 1 週間の注記", () => {
    const { container } = render(<WeeklyBandCard title="体重" unit="kg" points={points} step={1} format={{ kind: "fixed", digits: 2 }} tick="int" />);
    expect(screen.getByText("69.00")).toBeTruthy();
    expect(screen.getByText(/7\/20 からの週の中央値 ・ 最初の週は 70.00/)).toBeTruthy();
    const chart = container.querySelector('[role="img"]');
    expect(chart?.getAttribute("aria-label")).toContain("体重の週ごとの推移");
    expect(chart?.getAttribute("aria-label")).toContain("記録のある週は 2 週");
    expect((chart as HTMLElement).style.height).toBe(`${WEEKLY_CHART_HEIGHT}px`);
    expect(screen.getByText(/1 本が 1 週間\(月曜始まり\)/)).toBeTruthy();
  });

  it("表の形の代替: 新しい週が先。記録が少ない週は「-」", () => {
    render(<WeeklyBandCard title="体重" unit="kg" points={points} step={1} format={{ kind: "fixed", digits: 2 }} tick="int" />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td")?.textContent)).toEqual(["2026-07-20", "2026-07-13", "2026-07-06"]);
    expect(rows[1].textContent).toContain("-");
  });

  it("記録のある週が無ければ、図も注記も出さず、記録が無いと言う", () => {
    const { container } = render(<WeeklyBandCard title="体重" unit="kg" points={[week("2026-07-06", null)]} step={1} format={{ kind: "fixed", digits: 2 }} tick="int" />);
    expect(screen.getByText("この期間の記録がありません。")).toBeTruthy();
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(screen.queryByText(/1 本が 1 週間/)).toBeNull();
  });
});

describe("SleepWeeklyCard", () => {
  it("睡眠時間は、「7 時間 18 分」の形で出す", () => {
    render(<SleepWeeklyCard points={[week("2026-07-06", 438, 400, 470)]} />);
    expect(screen.getAllByText("7 時間 18 分").length).toBeGreaterThan(0);
  });
});

describe("IntakeWeeklyCard", () => {
  it("摂取の中央値と、目標の線。データ不足・書きかけの日を除くという注記", () => {
    render(<IntakeWeeklyCard intake={[week("2026-07-06", 2100), week("2026-07-13", 2300)]} target={[week("2026-07-06", 2200), week("2026-07-13", 2200)]} />);
    expect(screen.getByText("2,300")).toBeTruthy();
    expect(screen.getByText(/データが不足している日と、書きかけの日は、除いています/)).toBeTruthy();
  });

  it("記録がそろった週が無ければ、そう言う", () => {
    render(<IntakeWeeklyCard intake={[week("2026-07-06", null)]} target={[week("2026-07-06", 2200)]} />);
    expect(screen.getByText(/食事の記録がそろった週がありません/)).toBeTruthy();
  });
});

describe("ExerciseWeeklyCard", () => {
  it("合計の日数と、記録のあった週の数。0 の週は、ふだんどおりだと注記する。表で見る", () => {
    render(
      <ExerciseWeeklyCard
        weeks={[
          { weekStart: "2026-07-06", label: "7/6", days: 3 },
          { weekStart: "2026-07-13", label: "7/13", days: 0 },
          { weekStart: "2026-07-20", label: "7/20", days: 4 },
        ]}
      />,
    );
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText(/3 週のうち 2 週で、いつもより多く動いた記録があります/)).toBeTruthy();
    expect(screen.getByText(/0 の週は、ふだんどおり/)).toBeTruthy();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });
});

describe("ブラウザ側の部品の置き場(weekly-chart.tsx)", () => {
  it("部品と定数だけを出す(関数を出すと、サーバーの部品から呼べず、実行時に落ちる。jsdom のテストでは、その境目が無いので、ここで守る)", async () => {
    const exported = Object.keys(await import("./weekly-chart")).sort();
    expect(exported).toEqual(["WEEKLY_CHART_HEIGHT", "WeeklyBandChart", "WeeklyBarChart"]);
  });
});
