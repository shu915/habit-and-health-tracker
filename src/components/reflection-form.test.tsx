// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { isBefore, isLastChild } from "./dom-order";
import { ReflectionForm } from "./reflection-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-10-30";

const makeAction = (result: DayFormState = null) =>
  vi.fn<(state: DayFormState, formData: FormData) => Promise<DayFormState>>(async () => result);

const textarea = () => screen.getByLabelText("今日の気づき") as HTMLTextAreaElement;

describe("ReflectionForm", () => {
  it("保存済みの文章を出す(改行も残る)。まだ無ければ空欄", () => {
    render(<ReflectionForm date={DATE} initial={"1 行目\n2 行目"} action={makeAction()} />);
    expect(textarea().value).toBe("1 行目\n2 行目");
    cleanup();
    render(<ReflectionForm date={DATE} initial="" action={makeAction()} />);
    expect(textarea().value).toBe("");
  });

  it("保存を押すと、reflection だけが Server Action に渡る(日付や朝の項目は送らない)", async () => {
    const user = userEvent.setup();
    const action = makeAction();
    render(<ReflectionForm date={DATE} initial="" action={action} />);

    await user.type(textarea(), "良い一日");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const formData = action.mock.calls[0][1];
    expect(formData.get("reflection")).toBe("良い一日");
    const names = [...formData.keys()].filter((name) => !name.startsWith("$ACTION"));
    expect(names).toEqual(["reflection"]);
  });

  it("検証に失敗すると、エラーが出て、入力した文章が残る", async () => {
    const user = userEvent.setup();
    const action = makeAction({
      errors: { reflection: "今日の気づきは 2000 文字以内で入力してください" },
      values: { reflection: "残す文章" },
      submittedAt: 1,
    });
    render(<ReflectionForm date={DATE} initial="" action={action} />);

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/2000 文字以内/)).toBeTruthy();
    expect(textarea().value).toBe("残す文章");
    expect(textarea().getAttribute("aria-invalid")).toBe("true");
  });

  it("ボタンの並び: キャンセル(左)→ 保存(右端)。キャンセルはその日の詳細へ戻る", () => {
    render(<ReflectionForm date={DATE} initial="" action={makeAction()} />);
    const cancel = screen.getByRole("link", { name: "キャンセル" });
    const save = screen.getByRole("button", { name: "保存" });
    expect(isBefore(cancel, save)).toBe(true);
    expect(isLastChild(save)).toBe(true);
    expect(cancel.getAttribute("href")).toBe(`/days/${DATE}`);
  });
});
