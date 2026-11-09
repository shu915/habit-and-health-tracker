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
    ["2026-11-06", 1800],
    ["2026-11-07", 1800],
    ["2026-11-08", 1800],
    ["2026-11-10", 900],
  ]), // 過ぎた日が 3 日(中央値を出すのに要る最低日数)
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
    expect(label).toContain("食事の記録は 4 日");
    expect(label).toContain("過ぎた日の摂取の中央値は 1,800 kcal"); // 今日(11-10 の 900)は書きかけなので数えない
    expect(label).toContain("目標となるカロリーは 2,000 kcal");
  });

  it("データがそろった日が足りないとき(過ぎた日の 3 日未満)は、中央値を読み上げない(不正確な値を、確かなものに聞かせない)", () => {
    const few = points.map((p) => (p.date === "2026-11-06" || p.date === "2026-11-07" ? { ...p, intake: null, diffKcal: null } : p));
    render(<CalorieChart points={few} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("食事の記録は 2 日");
    expect(label).not.toContain("摂取の中央値");
  });

  it("データ不足の日(sparse)は、中央値の元に入れない", () => {
    const withSparse = points.map((p) => (p.date === "2026-11-08" ? { ...p, intake: 300, sparse: true } : p));
    render(<CalorieChart points={withSparse} />);
    // 有効なのは 11-06 と 11-07 の 2 日だけ(3 日に届かない)ので、中央値は出ない
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("摂取の中央値");
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
