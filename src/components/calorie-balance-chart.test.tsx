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
  // 差を出せた過ぎた日が 3 日(合計・中央値を出すのに要る最低日数): -500、(差なし)、-500、+300。今日(途中)の +100 は数えない
  const enoughPoints: CalorieChartPoint[] = [point("2026-11-06", 1700, 2200), point("2026-11-07", null, 2200), point("2026-11-08", 1700, 2200), point("2026-11-09", 2500, 2200), point("2026-11-10", 2300, 2200, true)];

  it("見出しに、過ぎた日の差の合計(符号つき)、日数、1 日の中央値を出す。日数が足りないうちは、体重への換算を出さずに理由を示す", () => {
    render(<CalorieBalanceCard points={enoughPoints} syncId="t" />);
    expect(screen.getByText("-700 kcal")).toBeTruthy(); // -500 - 500 + 300(今日の +100 は数えない)
    expect(screen.getByText(/体重への換算は、差を計算できた日が 7 日以上になってから/)).toBeTruthy();
    expect(screen.getByText(/5 日中 3 日に差を計算/)).toBeTruthy();
    expect(screen.getByText(/1 日の中央値 -500 kcal/)).toBeTruthy();
  });

  it("データがそろった日が足りないとき(過ぎた日の 3 日未満)は、合計・中央値・体重の換算を出さず、理由と日数を示す(不正確な値で集計しない)", () => {
    render(<CalorieBalanceCard points={points} syncId="t" />); // 差を出せた過ぎた日は 2 日
    expect(screen.queryByText("-200 kcal")).toBeNull();
    expect(screen.queryByText(/1 日の中央値/)).toBeNull();
    expect(screen.getByText(/データがそろった日が少ないため、差の合計・中央値・体重の換算は出しません/)).toBeTruthy();
    expect(screen.getByText(/いま 2 日、3 日以上で出ます/)).toBeTruthy();
  });

  it("差を計算できた日が、すべて、データ不足(sparse)なら、そう伝える(「差がまだありません」とは言わない)", () => {
    render(<CalorieBalanceCard points={points.map((p) => (p.inProgress ? p : { ...p, sparse: true }))} syncId="t" />);
    expect(screen.getByText(/差を計算できた日は、すべて、データが不足している/)).toBeTruthy();
    expect(screen.queryByText(/過ぎた日の差がまだありません/)).toBeNull();
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
