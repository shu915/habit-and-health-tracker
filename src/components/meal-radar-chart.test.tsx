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
  targetProteinG: 90,
  gender: "male",
  age: 39,
});

describe("MealRadarChart", () => {
  it("読み上げ用に、各軸の割合を文で持つ(色や形だけに頼らない)", () => {
    render(<MealRadarChart axes={radar.axes} inProgress={false} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("カロリー 90%");
    expect(label).toContain("たんぱく質 89%");
    expect(label).toContain("塩分 120%");
  });

  it("目標が無い軸は「目標なし」と読み上げる", () => {
    const noTarget = mealRadar({ meals: [], targetKcal: null, exerciseKcal: 0, targetProteinG: null, gender: null, age: null });
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

  it("軸の名前(6 つ)が描かれる", () => {
    const { container } = render(<MealRadarChart axes={radar.axes} inProgress={false} />);
    const text = container.textContent ?? "";
    for (const name of ["カロリー", "たんぱく質", "脂質", "糖質", "食物繊維", "塩分"]) expect(text).toContain(name);
  });
});
