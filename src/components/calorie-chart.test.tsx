// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCalorieTrend } from "@/lib/calorie-trend";
import { trendDates } from "@/lib/trend";
import { CalorieChart, type CalorieChartPoint } from "./calorie-chart";

afterEach(cleanup);

const points: CalorieChartPoint[] = buildCalorieTrend(trendDates("2026-11-10", 7), {
  rows: [],
  intake: new Map([
    ["2026-11-08", 1800],
    ["2026-11-10", 900],
  ]),
  exercises: [],
  priorMorningWeight: null,
  priorStampedTargetKcal: 2000, // 期間より前に固定した目標(日の行が無い過ぎた日は、これを引き継ぐ)
  profileTargetKcal: 2000,
  profileWeightKg: null,
  isFinishedDay: () => true,
}).map((point) => ({ ...point, inProgress: point.date === "2026-11-10" }));

describe("CalorieChart", () => {
  it("読み上げ用に、食事の記録の日数を文で持つ(色や形だけに頼らない)", () => {
    render(<CalorieChart points={points} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("摂取カロリーと目標となるカロリーの推移");
    expect(label).toContain("食事の記録は 2 日");
    expect(label).toContain("過ぎた日の摂取の中央値は 1,800 kcal"); // 今日(11-10 の 900)は書きかけなので数えない
    expect(label).toContain("目標となるカロリーは 2,000 kcal");
  });

  it("目標が決まっていなければ、目標の読み上げは付けない", () => {
    render(<CalorieChart points={points.map((p) => ({ ...p, target: null }))} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("目標となるカロリーは");
  });

  it("食事の記録が無ければ、その旨を持つ", () => {
    render(<CalorieChart points={points.map((p) => ({ ...p, intake: null }))} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("食事の記録がありません");
  });

  it("サーバーでは高さだけ確保し、引き継いだあとも食い違い(ハイドレーションの警告)が起きない", async () => {
    const element = <CalorieChart points={points} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(element);
    expect(container.innerHTML).toContain("height:220px");

    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    container.remove();
  });
});
