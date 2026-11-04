// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSleepTrend, trendDates } from "@/lib/trend";
import { SleepChart } from "./sleep-chart";

afterEach(cleanup);

const points = buildSleepTrend(
  trendDates("2026-11-10", 7),
  new Map([
    ["2026-11-08", { bedtime: "23:30", wakeTime: "06:30" }],
    ["2026-11-10", { bedtime: "01:00", wakeTime: "07:00" }],
  ]),
);

describe("SleepChart", () => {
  it("読み上げ用に、記録の日数と睡眠時間の中央値を文で持つ(色や形だけに頼らない)", () => {
    render(<SleepChart points={points} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("睡眠の推移");
    expect(label).toContain("記録は 2 日");
    expect(label).toContain("睡眠時間の中央値は 6時間30分"); // 420 分と 360 分の 2 日なので、真ん中の 2 つの平均 = 390 分
  });

  it("記録が無ければ、その旨を持つ", () => {
    render(<SleepChart points={buildSleepTrend(trendDates("2026-11-10", 7), new Map())} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("記録がありません");
  });

  it("サーバーでは高さだけ確保し、引き継いだあとも食い違い(ハイドレーションの警告)が起きない", async () => {
    const element = <SleepChart points={points} />;
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
