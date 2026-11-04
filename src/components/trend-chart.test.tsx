// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTrend, trendDates } from "@/lib/trend";
import { TrendChart } from "./trend-chart";

afterEach(cleanup);

const points = buildTrend(
  trendDates("2026-11-10", 7),
  new Map([
    ["2026-11-08", 98.5],
    ["2026-11-10", 98],
  ]),
  2,
);

describe("TrendChart", () => {
  it("読み上げ用に、記録の日数・最新の値・7 日移動平均を文で持つ(色や形だけに頼らない)", () => {
    render(<TrendChart title="体重" unit="kg" digits={2} points={points} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("体重の推移");
    expect(label).toContain("記録は 2 日");
    expect(label).toContain("最新は 98.00 kg");
    expect(label).toContain("7 日移動平均は 98.25 kg");
  });

  it("記録が無ければ、その旨を持つ", () => {
    render(<TrendChart title="体脂肪率" unit="%" digits={1} points={buildTrend(trendDates("2026-11-10", 7), new Map(), 1)} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("記録がありません");
  });

  it("サーバーでは高さだけ確保し、引き継いだあとも食い違い(ハイドレーションの警告)が起きない", async () => {
    const element = <TrendChart title="体重" unit="kg" digits={2} points={points} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(element);
    expect(container.innerHTML).toContain("height:180px"); // 描かれる前から場所を確保している

    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    container.remove();
  });
});
