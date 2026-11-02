// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealForm } from "./meal-form";

vi.mock("@/app/(app)/days/[date]/meals/actions", () => ({
  estimateMealAction: vi.fn(),
  saveMealAction: vi.fn(),
  updateMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
}));
vi.mock("@/lib/image-resize", () => ({ resizeImageToDataUrl: vi.fn() }));

// 本物の動きと同じ形で確かめる: サーバーが先に HTML を作り(今の時刻は分からないので空)、ブラウザが引き継いだあとに、今の時刻が入る。
// ブラウザだけで描画するテスト(render)では、この引き継ぎの切り替えを通らない
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12, 5));
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function hydrate(date: string, now: Date = new Date(2026, 9, 30, 12, 5)) {
  vi.setSystemTime(now);
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(<MealForm date={date} mode="new" />); // サーバーの描画(時刻は空)
  const serverHours = (container.querySelector('input[aria-label="食べた時刻（時）"]') as HTMLInputElement).value;

  await act(async () => {
    hydrateRoot(container, <MealForm date={date} mode="new" />);
  });
  const hours = () => container.querySelector('input[aria-label="食べた時刻（時）"]') as HTMLInputElement;
  const minutes = () => container.querySelector('input[aria-label="食べた時刻（分）"]') as HTMLInputElement;
  return { container, serverHours, hours, minutes };
}

describe("MealForm: サーバーの HTML を引き継いだあとの、食べた時刻の初期値", () => {
  it("サーバーの描画では空で、ブラウザが引き継いだあとに、今日の食事なら今の時刻が入る", async () => {
    const { serverHours, hours, minutes, container } = await hydrate("2026-10-30");

    expect(serverHours).toBe(""); // サーバーは、今の時刻を知らない
    expect(hours().value).toBe("12");
    expect(minutes().value).toBe("5");
    expect(container.textContent).toContain("昼食"); // バッジも付く
  });

  it("別の日の食事なら、引き継いだあとも空のまま(その日の時刻として、今の時刻は入れない)", async () => {
    const { hours, minutes, container } = await hydrate("2026-10-01");
    expect(hours().value).toBe("");
    expect(minutes().value).toBe("");
    expect(container.textContent).not.toContain("昼食");
  });

  it("深夜(午前 3 時より前)は、前の日の食事として、24 時以降の時刻が入る: 01:30 → 前日の 25:30、夜食", async () => {
    const { hours, minutes, container } = await hydrate("2026-10-29", new Date(2026, 9, 30, 1, 30));
    expect(hours().value).toBe("25");
    expect(minutes().value).toBe("30");
    expect(container.textContent).toContain("夜食");
  });

  it("深夜でも、今日(カレンダーの日付)の画面では、時刻は空のまま(その時刻は、前の日の食事のため)", async () => {
    const { hours, minutes } = await hydrate("2026-10-30", new Date(2026, 9, 30, 1, 30));
    expect(hours().value).toBe("");
    expect(minutes().value).toBe("");
  });

  it("深夜の今日の画面では、引き継いだあとに、前の日に追加する案内が出る(サーバーの HTML には、まだ無い)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    vi.setSystemTime(new Date(2026, 9, 30, 1, 30));
    container.innerHTML = renderToString(<MealForm date="2026-10-30" mode="new" />);
    expect(container.querySelector('[role="note"]')).toBeNull(); // サーバーは、今の時刻を知らない

    await act(async () => {
      hydrateRoot(container, <MealForm date="2026-10-30" mode="new" />);
    });
    expect(container.querySelector('[role="note"]')?.textContent).toContain("2026-10-29 に追加する");
  });

  it("午前 3 時ちょうどからは、その日の食事(03:00)", async () => {
    const { hours, minutes } = await hydrate("2026-10-30", new Date(2026, 9, 30, 3, 0));
    expect(hours().value).toBe("3");
    expect(minutes().value).toBe("0");
  });
});
