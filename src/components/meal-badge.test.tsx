// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MealBadge } from "./meal-badge";

afterEach(cleanup);

describe("MealBadge", () => {
  it.each([
    ["07:30", "朝食"],
    ["11:00", "昼食"],
    ["13:30", "昼食"],
    ["15:00", "間食"],
    ["19:00", "夕食"],
    ["23:00", "夜食"],
    ["25:30", "夜食"],
  ])("%s には「%s」のバッジを出す", (time, label) => {
    const { container } = render(<MealBadge time={time} />);
    expect(container.textContent).toBe(label);
  });

  it("読めない時刻のときは、何も出さない", () => {
    expect(render(<MealBadge time="" />).container.textContent).toBe("");
    expect(render(<MealBadge time="27:00" />).container.textContent).toBe("");
    expect(render(<MealBadge time="abc" />).container.textContent).toBe("");
  });
});
