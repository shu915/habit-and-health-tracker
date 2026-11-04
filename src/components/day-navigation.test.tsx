// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DayNavigation } from "./day-navigation";

afterEach(cleanup);

const hrefOf = (date: string) => `/days/${date}`;

describe("DayNavigation", () => {
  it("前の記録の日と次の記録の日へのリンクを、渡された URL の形で出す(日付は 1 日ずつとは限らない)", () => {
    render(<DayNavigation previous="2026-10-28" next="2026-11-02" hrefOf={hrefOf} />);
    expect(screen.getByRole("link", { name: "← 前の日" }).getAttribute("href")).toBe("/days/2026-10-28");
    expect(screen.getByRole("link", { name: "次の日 →" }).getAttribute("href")).toBe("/days/2026-11-02");
  });

  it("編集用の URL の形にもできる", () => {
    render(<DayNavigation previous={null} next="2026-11-02" hrefOf={(date) => `/days/${date}/edit`} />);
    expect(screen.getByRole("link", { name: "次の日 →" }).getAttribute("href")).toBe("/days/2026-11-02/edit");
  });

  it("前の記録が無ければ「前の日」を、次の記録が無ければ「次の日」を出さない", () => {
    const { rerender } = render(<DayNavigation previous={null} next="2026-11-02" hrefOf={hrefOf} />);
    expect(screen.queryByRole("link", { name: "← 前の日" })).toBeNull();
    expect(screen.getByRole("link", { name: "次の日 →" })).toBeTruthy();
    rerender(<DayNavigation previous="2026-10-28" next={null} hrefOf={hrefOf} />);
    expect(screen.queryByRole("link", { name: "次の日 →" })).toBeNull();
    expect(screen.getByRole("link", { name: "← 前の日" })).toBeTruthy();
  });
});
