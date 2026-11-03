// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayNavigation } from "./day-navigation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const hrefOf = (date: string) => `/days/${date}`;

describe("DayNavigation", () => {
  it("前の日と次の日へのリンクを、渡された URL の形で出す", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 3, 12, 0), toFake: ["Date"] });
    render(<DayNavigation date="2026-11-01" hrefOf={hrefOf} />);
    expect(screen.getByRole("link", { name: "← 前の日" }).getAttribute("href")).toBe("/days/2026-10-31");
    expect(screen.getByRole("link", { name: "次の日 →" }).getAttribute("href")).toBe("/days/2026-11-02");
  });

  it("編集用の URL の形にもできる", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 3, 12, 0), toFake: ["Date"] });
    render(<DayNavigation date="2026-11-01" hrefOf={(date) => `/days/${date}/edit`} />);
    expect(screen.getByRole("link", { name: "次の日 →" }).getAttribute("href")).toBe("/days/2026-11-02/edit");
  });

  it("翌日より先は記録できないので、「次の日」を出さない(今日の翌日までは出す)", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 3, 12, 0), toFake: ["Date"] });
    render(<DayNavigation date="2026-11-04" hrefOf={hrefOf} />); // 翌日。次は 11-05(出さない)
    expect(screen.queryByRole("link", { name: "次の日 →" })).toBeNull();
    expect(screen.getByRole("link", { name: "← 前の日" })).toBeTruthy();
  });
});
