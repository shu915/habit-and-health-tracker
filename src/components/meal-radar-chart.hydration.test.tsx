// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MealRadarChart } from "./meal-radar-chart";
import { mealRadar } from "@/lib/meal-radar";

// Recharts は、サーバーでは固定の大きさの空の枠だけを出し、チャート本体はブラウザで描く。
// 枠が場所を確保する(描かれてもレイアウトがずれない)ことと、引き継いだあとに描かれること、食い違い(ハイドレーションの警告)が起きないことを確かめる
const radar = mealRadar({
  meals: [{ kcal: 1800, proteinG: "80.0", fatG: "50.0", netCarbG: "230.0", fiberG: "15.0", saltG: "9.0" }],
  targetKcal: 2000,
  exerciseKcal: 0,
  targetProteinG: 90,
  gender: "female",
  age: 39,
});

describe("MealRadarChart: サーバーの HTML の引き継ぎ", () => {
  it("サーバーでは大きさだけ確保し、引き継いだあとに軸の名前まで描かれる。食い違いは起きない", async () => {
    const element = <MealRadarChart axes={radar.axes} inProgress={false} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(element);
    expect(container.innerHTML).toContain("width:280px;height:250px"); // 描かれる前から場所を確保している
    expect(container.textContent).not.toContain("たんぱく質");

    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("たんぱく質");
    container.remove();
  });
});
