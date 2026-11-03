// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PositiveFormState } from "@/app/(app)/days/[date]/positive/actions";
import { EMPTY_POSITIVE, PositiveForm } from "./positive-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-05-12";

// 保存の Server Action の代わり。呼ばれたときの FormData を見る
const makeAction = (result: PositiveFormState = null) =>
  vi.fn<(state: PositiveFormState, formData: FormData) => Promise<PositiveFormState>>(async () => result);

const control = (n: number) => screen.getByLabelText(`${n} つ目`) as HTMLTextAreaElement;

describe("PositiveForm", () => {
  it("1 行の欄を 3 つ出す。初めは空で、例は入力欄の薄い文字(値ではない)", () => {
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={makeAction()} />);
    for (const n of [1, 2, 3]) {
      expect(control(n).value).toBe("");
      expect(control(n).placeholder).toMatch(/^例: /);
    }
    // 欄ごとに違う例を出す
    expect(new Set([1, 2, 3].map((n) => control(n).placeholder)).size).toBe(3);
  });

  it("欄は 3 行分の高さの複数行入力", () => {
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={makeAction()} />);
    for (const n of [1, 2, 3]) {
      expect(control(n).tagName).toBe("TEXTAREA");
      expect(control(n).rows).toBe(3);
    }
  });

  it("説明に、なぜそう感じたかも書くとよいこと・AI には送らないこと・医療上の効果は約束しないことを出す", () => {
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={makeAction()} />);
    expect(screen.getByText(/なぜそう感じたかも書くと、気分を整える効果が高まりやすいと言われています/)).toBeTruthy();
    expect(screen.getByText(/内容は AI には送りません/)).toBeTruthy();
    expect(screen.getByText(/医療上の効果を約束するものではありません/)).toBeTruthy();
  });

  it("保存済みの値を各欄に出す", () => {
    render(<PositiveForm date={DATE} initial={{ body1: "天気が良かった。気分が晴れた", body2: "味噌汁", body3: "" }} action={makeAction()} />);
    expect(control(1).value).toBe("天気が良かった。気分が晴れた");
    expect(control(2).value).toBe("味噌汁");
    expect(control(3).value).toBe("");
  });

  it("入力して保存すると、3 つの欄の値を Server Action に送る", async () => {
    const action = makeAction();
    const user = userEvent.setup();
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={action} />);

    await user.type(control(1), "散歩した。風が気持ちよかった");
    await user.type(control(3), "早く寝た");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][1].entries())).toEqual({ body1: "散歩した。風が気持ちよかった", body2: "", body3: "早く寝た" });
  });

  it("検証に失敗したら、その欄にエラーを出し、入力した値を残す", async () => {
    const failed: PositiveFormState = {
      errors: { body2: "2 つ目は 200 文字までです" },
      values: { body1: "残る", body2: "長すぎた", body3: "" },
      submittedAt: 1,
    };
    const user = userEvent.setup();
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={makeAction(failed)} />);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("2 つ目は 200 文字までです")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("入力内容を確認してください");
    expect(control(2).getAttribute("aria-invalid")).toBe("true");
    expect(control(2).getAttribute("aria-describedby")).toBe("positive-body2-error");
    expect(control(1).value).toBe("残る");
    expect(control(2).value).toBe("長すぎた");
  });

  it("キャンセルは、その日の詳細へのリンク", () => {
    render(<PositiveForm date={DATE} initial={EMPTY_POSITIVE} action={makeAction()} />);
    expect(screen.getByRole("link", { name: "キャンセル" }).getAttribute("href")).toBe(`/days/${DATE}`);
  });
});
