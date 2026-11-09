// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MealRadarChart } from "./meal-radar-chart";
import { mealRadar } from "@/lib/meal-radar";

afterEach(cleanup);

const radar = mealRadar({
  meals: [{ kcal: 1800, proteinG: "80.0", fatG: "50.0", netCarbG: "230.0", fiberG: "15.0", saltG: "9.0" }],
  targetKcal: 2000,
  exerciseKcal: 0,
});

describe("MealRadarChart", () => {
  it("読み上げ用に、各軸の割合を文で持つ(色や形だけに頼らない)", () => {
    render(<MealRadarChart axes={radar.axes} inProgress={false} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("カロリー 90%");
    expect(label).toContain("たんぱく質 97%");
    expect(label).toContain("塩分 90%");
  });

  it("目標が無い軸は「目標なし」と読み上げる", () => {
    const noTarget = mealRadar({ meals: [], targetKcal: null, exerciseKcal: 0 });
    render(<MealRadarChart axes={noTarget.axes} inProgress={false} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("カロリー 目標なし");
  });

  it("過ぎた日は実線、書きかけの日は点線で描く", () => {
    const dashed = (inProgress: boolean) => {
      const { container, unmount } = render(<MealRadarChart axes={radar.axes} inProgress={inProgress} />);
      const result = container.querySelectorAll('[stroke-dasharray="5 4"]').length;
      unmount();
      return result;
    };
    expect(dashed(false)).toBe(0);
    expect(dashed(true)).toBeGreaterThan(0);
  });

  it("目標のゾーンは、薄く塗った帯で描き、面の色でくり抜かない(中の格子線を隠さない)", () => {
    const { container } = render(<MealRadarChart axes={radar.axes} inProgress={false} />);
    const band = Array.from(container.querySelectorAll("path")).find((path) => path.getAttribute("fill") === "var(--viz-ring)");
    expect(band, "ゾーンの帯").toBeDefined();
    expect(band?.getAttribute("fill-rule")).toBe("evenodd"); // 外側と内側の輪郭の間だけ塗る(内側は塗らない。塗ると、グラフの最大のように見える)
    expect(band?.getAttribute("fill-opacity")).toBe("0.18"); // 透けるので、格子線が見える
    expect(container.querySelector('[fill="var(--viz-surface)"]:not(circle)')).toBeNull(); // 面の色で塗りつぶさない(くり抜きは使わない)
  });

  it("軸の名前(6 つ)が描かれる", () => {
    const { container } = render(<MealRadarChart axes={radar.axes} inProgress={false} />);
    const text = container.textContent ?? "";
    for (const name of ["カロリー", "たんぱく質", "脂質", "糖質", "食物繊維", "塩分"]) expect(text).toContain(name);
  });
});
