// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayJumpForm } from "./day-jump-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// 今日を固定する(ローカル時間の 2026-10-30)。Date だけを偽物にして、user-event のタイマーには触らない
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 9, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const dateInput = () => screen.getByLabelText("編集する日") as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: "編集" });

describe("DayJumpForm", () => {
  it("日付の初期値は今日で、未来の日付は選べない(max が今日)", () => {
    render(<DayJumpForm />);
    expect(dateInput().value).toBe("2026-10-30");
    expect(dateInput().max).toBe("2026-10-30");
  });

  it("そのまま押すと、今日の編集ページへ移動する", async () => {
    const user = userEvent.setup();
    render(<DayJumpForm />);
    await user.click(submit());
    expect(push).toHaveBeenCalledWith("/days/2026-10-30/edit");
  });

  it("過去の日付を選ぶと、その日の編集ページへ移動する", async () => {
    const user = userEvent.setup();
    render(<DayJumpForm />);
    fireEvent.change(dateInput(), { target: { value: "2026-10-01" } });
    await user.click(submit());
    expect(push).toHaveBeenCalledWith("/days/2026-10-01/edit");
  });

  it("未来の日付は、移動せずにエラーを出す", async () => {
    const user = userEvent.setup();
    render(<DayJumpForm />);
    fireEvent.change(dateInput(), { target: { value: "2026-10-31" } });
    await user.click(submit());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("未来の日付は選べません");
  });

  it("日付が空なら、移動せずにエラーを出す。選び直せばエラーは消える", async () => {
    const user = userEvent.setup();
    render(<DayJumpForm />);
    fireEvent.change(dateInput(), { target: { value: "" } });
    await user.click(submit());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("日付を選んでください");

    fireEvent.change(dateInput(), { target: { value: "2026-10-29" } });
    await user.click(submit());
    expect(push).toHaveBeenCalledWith("/days/2026-10-29/edit");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
