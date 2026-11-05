// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalorieChartPoint } from "@/components/calorie-chart";
import { CalorieBalanceCard } from "./calorie-balance-card";
import { CalorieBalanceChart } from "./calorie-balance-chart";

afterEach(cleanup);

const point = (date: string, intake: number | null, burnKcal: number | null, inProgress = false): CalorieChartPoint => ({
  date,
  intake,
  target: 1800,
  exerciseKcal: 0,
  baseKcal: 1800,
  burnKcal,
  diffKcal: intake === null || burnKcal === null ? null : intake - burnKcal,
  inProgress,
});
// 差: -500(少ない)、+300(多い)、今日(途中)は +100
const points: CalorieChartPoint[] = [point("2026-11-07", null, 2200), point("2026-11-08", 1700, 2200), point("2026-11-09", 2500, 2200), point("2026-11-10", 2300, 2200, true)];

describe("CalorieBalanceChart", () => {
  it("読み上げ用に、差を出せた日数と中央値(過ぎた日だけ)、多く食べた日数を文で持つ", () => {
    render(<CalorieBalanceChart points={points} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("差を出せた日は 3 日");
    expect(label).toContain("過ぎた日の差の中央値は -100 kcal"); // (-500 と +300 の中央値)。今日(+100)は数えない
    expect(label).toContain("多く食べた日は 2 日"); // +300 と、途中の +100
  });

  it("差を出せる日が無ければ、その旨を持つ", () => {
    render(<CalorieBalanceChart points={points.map((p) => ({ ...p, diffKcal: null }))} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("差を出せる日がありません");
  });

  it("サーバーでは高さだけ確保し、引き継いだあとも食い違い(ハイドレーションの警告)が起きない", async () => {
    const element = <CalorieBalanceChart points={points} />;
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

describe("CalorieBalanceCard", () => {
  it("見出しに、過ぎた日の差の合計(符号つき)、日数、1 日の中央値を出す。日数が足りないうちは、体重への換算を出さずに理由を示す", () => {
    render(<CalorieBalanceCard points={points} syncId="t" />);
    expect(screen.getByText("-200 kcal")).toBeTruthy(); // -500 + 300(今日の +100 は数えない)
    expect(screen.getByText(/体重への換算は、差を計算できた日が 7 日以上になってから/)).toBeTruthy();
    expect(screen.getByText(/4 日中 2 日に差を計算/)).toBeTruthy();
    expect(screen.getByText(/1 日の中央値 -100 kcal/)).toBeTruthy();
  });

  it("差を計算できた日が 7 日以上あれば、体重に換算した目安を出す", () => {
    const week = Array.from({ length: 7 }, (_, i) => point(`2026-11-0${i + 1}`, 1480, 2200)); // 毎日 -720 → 合計 -5,040 kcal = -0.7kg
    render(<CalorieBalanceCard points={week} syncId="t" />);
    expect(screen.getByText(/体重に換算して約 -0\.7kg/)).toBeTruthy();
  });

  it("差を計算できる日が無ければ、図は出さず、必要な項目を案内する", () => {
    render(<CalorieBalanceCard points={points.map((p) => ({ ...p, diffKcal: null }))} syncId="t" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/差を計算できる日がありません/)).toBeTruthy();
  });
});
