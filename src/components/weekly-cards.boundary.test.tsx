// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeekPoint } from "@/lib/weekly-points";

// サーバーの部品(weekly-cards.tsx)から、ブラウザ側のグラフ(weekly-chart.tsx。"use client")へ渡す props には、関数を含めない
// (関数は、サーバーからブラウザへ渡せず、実行時に落ちる。jsdom のテストには、その境目が無いので、渡した props を記録して確かめる)。
const received = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./weekly-chart", () => ({
  WEEKLY_CHART_HEIGHT: 200,
  WeeklyBandChart: (props: Record<string, unknown>) => {
    received.push(props);
    return null;
  },
  WeeklyBarChart: (props: Record<string, unknown>) => {
    received.push(props);
    return null;
  },
}));

import { ExerciseWeeklyCard, IntakeWeeklyCard, SleepWeeklyCard, WeeklyBandCard } from "./weekly-cards";

afterEach(() => {
  cleanup();
  received.length = 0;
});

const week = (weekStart: string, median: number): WeekPoint => ({ weekStart, label: "7/6", recorded: 5, median, low: median - 1, high: median + 1 });

// 値が、関数・Symbol を含まないこと(入れ子の中も)
function assertSerializable(value: unknown, path = "props"): void {
  expect(typeof value, path).not.toBe("function");
  expect(typeof value, path).not.toBe("symbol");
  if (Array.isArray(value)) value.forEach((item, i) => assertSerializable(item, `${path}[${i}]`));
  else if (typeof value === "object" && value !== null) for (const [key, inner] of Object.entries(value)) assertSerializable(inner, `${path}.${key}`);
}

describe("サーバーの部品からブラウザ側のグラフへ渡す props", () => {
  it("線 + 帯のカード(睡眠・体重・体脂肪率): 関数を渡さない", () => {
    render(<SleepWeeklyCard points={[week("2026-07-06", 430)]} />);
    render(<WeeklyBandCard title="体重" unit="kg" points={[week("2026-07-06", 70)]} step={1} format={{ kind: "fixed", digits: 2 }} tick="int" />);
    expect(received).toHaveLength(2);
    received.forEach((props) => assertSerializable(props));
  });

  it("摂取と運動のカード: 関数を渡さない", () => {
    render(<IntakeWeeklyCard intake={[week("2026-07-06", 2100)]} target={[week("2026-07-06", 2200)]} />);
    render(<ExerciseWeeklyCard weeks={[{ weekStart: "2026-07-06", label: "7/6", days: 3 }]} />);
    expect(received).toHaveLength(2);
    received.forEach((props) => assertSerializable(props));
  });
});
