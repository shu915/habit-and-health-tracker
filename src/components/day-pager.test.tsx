// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DayPager } from "./day-pager";

afterEach(cleanup);

describe("DayPager", () => {
  it("1 ページだけなら、移動のリンクは出さない", () => {
    render(<DayPager page={1} lastPage={1} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("1 ページ目は「前の 14 件」だけ(?page=2)", () => {
    render(<DayPager page={1} lastPage={3} />);
    expect(screen.getByRole("link", { name: /前の 14 件/ }).getAttribute("href")).toBe("/?page=2#day-list");
    expect(screen.queryByRole("link", { name: /新しい/ })).toBeNull();
  });

  it("途中のページは両方出し、新しいほうは 1 ページ目なら /(page なし)", () => {
    render(<DayPager page={2} lastPage={3} />);
    expect(screen.getByRole("link", { name: /新しい 14 件/ }).getAttribute("href")).toBe("/#day-list");
    expect(screen.getByRole("link", { name: /前の 14 件/ }).getAttribute("href")).toBe("/?page=3#day-list");
  });

  it("最後のページは「新しい 14 件」だけ", () => {
    render(<DayPager page={3} lastPage={3} />);
    expect(screen.getByRole("link", { name: /新しい 14 件/ }).getAttribute("href")).toBe("/?page=2#day-list");
    expect(screen.queryByRole("link", { name: /前の/ })).toBeNull();
  });
});
