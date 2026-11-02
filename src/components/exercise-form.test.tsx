// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExerciseFormState } from "@/app/(app)/days/[date]/exercises/actions";
import { EMPTY_EXERCISE, ExerciseForm } from "./exercise-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-05-12";

// 保存の Server Action の代わり。呼ばれたときの FormData を見る
const makeAction = (result: ExerciseFormState = null) =>
  vi.fn<(state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>>(async () => result);

const control = (label: string) => screen.getByLabelText(label) as HTMLSelectElement | HTMLInputElement;

describe("ExerciseForm", () => {
  it("二重に数えないための注意書きを出す(ふだんの運動は活動係数に含まれ、増えた分だけ記録する)", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    expect(screen.getByText(/活動係数に、すでに含まれています/)).toBeTruthy();
    expect(screen.getByText("いつもより多く動いた分だけ")).toBeTruthy();
  });

  it("種類と強さは一覧から選ぶ(散歩(非定期)・室内エクササイズ・筋トレ・その他 / 軽め・普通・ハード)。初めは未選択", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    const optionsOf = (select: HTMLSelectElement) => Array.from(select.options).map((option) => option.textContent);
    expect(optionsOf(control("種類") as HTMLSelectElement)).toEqual(["選んでください", "散歩(非定期)", "室内エクササイズ", "筋トレ", "その他"]);
    expect(optionsOf(control("強さ") as HTMLSelectElement)).toEqual(["選んでください", "軽め", "普通", "ハード"]);
    expect(control("種類").value).toBe("");
    expect(control("強さ").value).toBe("");
    expect(control("時間").value).toBe("");
    expect(control("メモ").value).toBe("");
  });

  it("保存済みの値を各欄に出す", () => {
    render(<ExerciseForm date={DATE} initial={{ type: "strength", intensity: "hard", minutes: "45", memo: "脚の日" }} action={makeAction()} />);
    expect(control("種類").value).toBe("strength");
    expect(control("強さ").value).toBe("hard");
    expect(control("時間").value).toBe("45");
    expect(control("メモ").value).toBe("脚の日");
  });

  it("一覧にない種類・強さが保存されていても、現在の値として残る(選び直しにならない)", () => {
    render(<ExerciseForm date={DATE} initial={{ type: "retired-type", intensity: "extreme", minutes: "10", memo: "" }} action={makeAction()} />);
    expect(control("種類").value).toBe("retired-type");
    expect(control("強さ").value).toBe("extreme");
  });

  it("入力して保存すると、4 つの欄の値を Server Action に送る", async () => {
    const action = makeAction();
    const user = userEvent.setup();
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={action} />);

    await user.selectOptions(control("種類"), "walk");
    await user.selectOptions(control("強さ"), "light");
    await user.type(control("時間"), "20");
    await user.type(control("メモ"), "公園");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0][1];
    expect(Object.fromEntries(formData.entries())).toEqual({ type: "walk", intensity: "light", minutes: "20", memo: "公園" });
  });

  it("検証に失敗したら、欄ごとのエラーを出し、入力した値を残す", async () => {
    const failed: ExerciseFormState = {
      errors: { type: "種類を選んでください", minutes: "時間(分)は 1 以上 600 以下の整数で入力してください" },
      values: { type: "", intensity: "normal", minutes: "0", memo: "残る" },
      submittedAt: 1,
    };
    const user = userEvent.setup();
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction(failed)} />);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("種類を選んでください")).toBeTruthy();
    expect(screen.getByText("時間(分)は 1 以上 600 以下の整数で入力してください")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("入力内容を確認してください");
    expect(control("種類").getAttribute("aria-invalid")).toBe("true");
    expect(control("時間").getAttribute("aria-describedby")).toBe("exercise-minutes-error");
    expect(control("強さ").value).toBe("normal");
    expect(control("時間").value).toBe("0");
    expect(control("メモ").value).toBe("残る");
  });

  it("その日が上限のときは、欄のエラーではなく、理由をそのまま出し、入力した値を残す", async () => {
    const full: ExerciseFormState = {
      errors: {},
      values: { type: "walk", intensity: "normal", minutes: "30", memo: "残る" },
      message: "1 日に記録できる運動は 5 件までです。",
      submittedAt: 1,
    };
    const user = userEvent.setup();
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction(full)} />);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("alert")).textContent).toBe("1 日に記録できる運動は 5 件までです。");
    expect(control("メモ").value).toBe("残る");
  });

  it("キャンセルは、その日の詳細へのリンク", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    expect(screen.getByRole("link", { name: "キャンセル" }).getAttribute("href")).toBe(`/days/${DATE}`);
  });

  describe("削除(直すときだけ)", () => {
    it("追加のときは、削除のボタンを出さない", () => {
      render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
      expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
    });

    it("「削除」を押しただけでは消えず、確認で「削除する」を押したときだけ削除する。「やめる」で戻れる", async () => {
      const deleteAction = vi.fn(async () => {});
      const user = userEvent.setup();
      render(<ExerciseForm date={DATE} initial={{ type: "walk", intensity: "normal", minutes: "30", memo: "" }} action={makeAction()} deleteAction={deleteAction} />);

      await user.click(screen.getByRole("button", { name: "削除" }));
      expect(deleteAction).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog", { name: "削除の確認" })).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "やめる" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(deleteAction).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "削除" }));
      await user.click(screen.getByRole("button", { name: "削除する" }));
      expect(deleteAction).toHaveBeenCalledTimes(1);
    });
  });
});
