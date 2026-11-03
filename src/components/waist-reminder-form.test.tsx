// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaistFormState } from "@/app/(app)/profile/actions";
import { WaistReminderForm } from "./waist-reminder-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const makeAction = (result: WaistFormState = null) => vi.fn<(state: WaistFormState, formData: FormData) => Promise<WaistFormState>>(async () => result);
const input = () => screen.getByLabelText("ウエスト") as HTMLInputElement;

describe("WaistReminderForm", () => {
  it("今のウエストが入っている。無ければ空", () => {
    render(<WaistReminderForm current="80.5" action={makeAction()} />);
    expect(input().value).toBe("80.5");
    cleanup();
    render(<WaistReminderForm current={null} action={makeAction()} />);
    expect(input().value).toBe("");
  });

  it("そのまま「保存」を押すと、今のウエストの値を送る(値が変わらない月でも更新できる)", async () => {
    const action = makeAction();
    const user = userEvent.setup();
    render(<WaistReminderForm current="80.5" action={action} />);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({ currentWaistCm: "80.5" });
  });

  it("入れ直した値を送る", async () => {
    const action = makeAction();
    const user = userEvent.setup();
    render(<WaistReminderForm current="80.5" action={action} />);
    await user.clear(input());
    await user.type(input(), "79.8");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action.mock.calls[0][1].get("currentWaistCm")).toBe("79.8");
  });

  it("検証に失敗したら、エラーを出し、入れた値を残す", async () => {
    const failed: WaistFormState = { error: "ウエスト(cm)は 30 以上 250 以下の数値で入力してください", value: "abc", submittedAt: 1 };
    const user = userEvent.setup();
    render(<WaistReminderForm current="80.5" action={makeAction(failed)} />);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("alert")).textContent).toContain("30 以上 250 以下");
    expect(input().value).toBe("abc");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")).toBe("waist-reminder-error");
  });
});
