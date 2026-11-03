// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExerciseFormState } from "@/app/(app)/days/[date]/exercises/actions";
import { isBefore, isFirstChild, isLastChild } from "./dom-order";
import { EMPTY_EXERCISE, ExerciseForm } from "./exercise-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const DATE = "2026-05-12";

// 保存の Server Action の代わり。呼ばれたときの FormData を見る
const makeAction = (result: ExerciseFormState = null) =>
  vi.fn<(state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>>(async () => result);

const control = (label: string) => screen.getByLabelText(label) as HTMLSelectElement | HTMLInputElement;

describe("ExerciseForm", () => {
  it("ボタンの並び: キャンセル(左)→ 保存(右端)", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    const cancel = screen.getByRole("link", { name: "キャンセル" });
    const save = screen.getByRole("button", { name: "保存" });
    expect(isBefore(cancel, save)).toBe(true);
    expect(isLastChild(save)).toBe(true);
    expect(save.className).toContain("bg-zinc-900"); // 決定は濃い色
    expect(cancel.className).toContain("bg-zinc-200"); // キャンセルはグレー
    expect(cancel.className).toContain("py-2"); // 高さはそろえる
    expect(save.className).toContain("py-2");
    expect(save.className).toContain("min-w-24"); // 決定も、字が少なくても細くならない(キャンセルと同じ幅)
  });

  it("直すときのボタンの並び: 削除(左端に離す)、キャンセル、保存(右端)。削除の確認は、やめる(左)→ 削除する(右)", async () => {
    const user = userEvent.setup();
    render(<ExerciseForm date={DATE} initial={{ type: "walk", intensity: "normal", minutes: "30", startTime: "", memo: "" }} action={makeAction()} deleteAction={vi.fn(async () => {})} />);
    const remove = screen.getByRole("button", { name: "削除" });
    const cancel = screen.getByRole("link", { name: "キャンセル" });
    const save = screen.getByRole("button", { name: "保存" });
    expect(isFirstChild(remove)).toBe(true);
    expect(remove.parentElement?.contains(cancel)).toBe(false); // キャンセル・決定とは別のセル(離して置く)
    expect(isBefore(remove, cancel)).toBe(true);
    expect(isBefore(cancel, save)).toBe(true);
    expect(isLastChild(save)).toBe(true);

    await user.click(remove);
    const back = screen.getByRole("button", { name: "やめる" });
    const confirm = screen.getByRole("button", { name: "削除する" });
    expect(isBefore(back, confirm)).toBe(true);
    expect(back.className).toContain("bg-zinc-200");
    expect(confirm.className).toContain("bg-zinc-900");
    expect(back.className).toContain("py-2"); // 高さはそろえる
    expect(confirm.className).toContain("py-2");
    expect(confirm.className).toContain("min-w-24");
    expect(remove.className).toContain("py-2");
  });

  it("二重に数えないための注意書きを出す(ふだんの運動は活動係数に含まれ、増えた分だけ記録する)", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    expect(screen.getByText(/活動係数に、すでに含まれています/)).toBeTruthy();
    expect(screen.getByText("いつもより多く動いた分だけ")).toBeTruthy();
  });

  it("種類と強さは一覧から選ぶ(散歩・室内エクササイズ・筋トレ・その他 / 軽め・普通・ハード)。初めは未選択", () => {
    render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
    const optionsOf = (select: HTMLSelectElement) => Array.from(select.options).map((option) => option.textContent);
    expect(optionsOf(control("種類") as HTMLSelectElement)).toEqual(["選んでください", "散歩", "室内エクササイズ", "筋トレ", "その他"]);
    expect(optionsOf(control("強さ") as HTMLSelectElement)).toEqual(["選んでください", "軽め", "普通", "ハード"]);
    expect(control("種類").value).toBe("");
    expect(control("強さ").value).toBe("");
    expect(control("時間").value).toBe("");
    expect(control("メモ").value).toBe("");
  });

  it("保存済みの値を各欄に出す", () => {
    render(<ExerciseForm date={DATE} initial={{ type: "strength", intensity: "hard", minutes: "45", startTime: "19:05", memo: "脚の日" }} action={makeAction()} />);
    expect(control("種類").value).toBe("strength");
    expect(control("強さ").value).toBe("hard");
    expect(control("時間").value).toBe("45");
    expect(control("メモ").value).toBe("脚の日");
  });

  it("一覧にない種類・強さが保存されていても、現在の値として残る(選び直しにならない)", () => {
    render(<ExerciseForm date={DATE} initial={{ type: "retired-type", intensity: "extreme", minutes: "10", startTime: "", memo: "" }} action={makeAction()} />);
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
    expect(Object.fromEntries(formData.entries())).toEqual({ type: "walk", intensity: "light", minutes: "20", startTime: "", memo: "公園" });
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

  describe("開始時刻", () => {
    const hours = () => screen.getByLabelText("開始時刻（時）") as HTMLInputElement;
    const minutes = () => screen.getByLabelText("開始時刻（分）") as HTMLInputElement;
    const sentStartTime = (action: ReturnType<typeof makeAction>) => action.mock.calls[0][1].get("startTime");
    // 端末の今の時刻を固定する(Date だけ)。月は 0 始まりなので、5 月は 4
    const at = (...args: [number, number, number, number, number]) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(...args));
    };

    it("時と分の2つの欄で入れる。任意で、初めは空。保存済みの時刻は2つの欄に出る", () => {
      render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction()} />);
      expect(hours().value).toBe("");
      expect(minutes().value).toBe("");
      cleanup();

      render(<ExerciseForm date={DATE} initial={{ ...EMPTY_EXERCISE, startTime: "19:05" }} action={makeAction()} />);
      expect(hours().value).toBe("19");
      expect(minutes().value).toBe("5");
    });

    it("追加のとき、画面の日付が今日なら、今の時刻が入る", async () => {
      at(2026, 4, 12, 14, 5);
      const action = makeAction();
      const user = userEvent.setup();
      render(<ExerciseForm date="2026-05-12" initial={EMPTY_EXERCISE} action={action} defaultToNow />);
      expect(hours().value).toBe("14");
      expect(minutes().value).toBe("5");

      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(sentStartTime(action)).toBe("14:05");
    });

    it("追加のとき、別の日の画面なら、空のまま", () => {
      at(2026, 4, 12, 14, 5);
      render(<ExerciseForm date="2026-05-11" initial={EMPTY_EXERCISE} action={makeAction()} defaultToNow />);
      expect(hours().value).toBe("");
      expect(minutes().value).toBe("");
    });

    it("午前 3 時より前は前の日の運動として、前の日の画面にだけ、24 時以降の表記で今の時刻が入る", () => {
      at(2026, 4, 12, 1, 30);
      render(<ExerciseForm date="2026-05-11" initial={EMPTY_EXERCISE} action={makeAction()} defaultToNow />);
      expect(hours().value).toBe("25");
      expect(minutes().value).toBe("30");
      cleanup();

      render(<ExerciseForm date="2026-05-12" initial={EMPTY_EXERCISE} action={makeAction()} defaultToNow />);
      expect(hours().value).toBe("");
    });

    it("直すとき(defaultToNow なし)は、今の時刻を入れない。時刻なしの運動は空のまま", () => {
      at(2026, 4, 12, 14, 5);
      render(<ExerciseForm date="2026-05-12" initial={EMPTY_EXERCISE} action={makeAction()} />);
      expect(hours().value).toBe("");
    });

    it("時と分を入れると、HH:MM にして送る。24 時以降も入れられる", async () => {
      const action = makeAction();
      const user = userEvent.setup();
      render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={action} />);
      await user.type(hours(), "25");
      await user.type(minutes(), "5");
      await user.click(screen.getByRole("button", { name: "保存" }));
      expect(sentStartTime(action)).toBe("25:05");
    });

    it("時刻の検証に失敗したら、その欄のエラーを出し、入れた時と分を残す", async () => {
      const failed: ExerciseFormState = {
        errors: { startTime: "開始時刻は、時を 0〜26、分を 0〜59 で入力してください" },
        values: { type: "walk", intensity: "normal", minutes: "30", startTime: "27:00", memo: "" },
        submittedAt: 1,
      };
      const user = userEvent.setup();
      render(<ExerciseForm date={DATE} initial={EMPTY_EXERCISE} action={makeAction(failed)} />);
      await user.click(screen.getByRole("button", { name: "保存" }));

      expect(await screen.findByText("開始時刻は、時を 0〜26、分を 0〜59 で入力してください")).toBeTruthy();
      expect(hours().getAttribute("aria-invalid")).toBe("true");
      expect(hours().getAttribute("aria-describedby")).toBe("exercise-startTime-error");
      expect(hours().value).toBe("27");
      expect(minutes().value).toBe("00"); // 入れた文字をそのまま戻す(直す手がかりを消さない)
    });
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
      render(<ExerciseForm date={DATE} initial={{ type: "walk", intensity: "normal", minutes: "30", startTime: "", memo: "" }} action={makeAction()} deleteAction={deleteAction} />);

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
