// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { DayForm, type DayFormInitial } from "./day-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DATE = "2026-10-30";
const empty: DayFormInitial = {
  sleepBedtime: "",
  sleepWakeTime: "",
  morningWeightKg: "",
  morningBodyFatPercent: "",
  reflection: "",
};
const filled: DayFormInitial = {
  sleepBedtime: "23:30",
  sleepWakeTime: "06:05",
  morningWeightKg: "98.30",
  morningBodyFatPercent: "32.0",
  reflection: "1 行目\n2 行目",
};

// 保存の Server Action の代わり。呼ばれたときの FormData を見る
const makeAction = (result: DayFormState = null) =>
  vi.fn<(state: DayFormState, formData: FormData) => Promise<DayFormState>>(async () => result);

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

describe("DayForm", () => {
  it("保存済みの値を、各欄に出す(振り返りの改行も残る)", () => {
    render(<DayForm date={DATE} initial={filled} action={makeAction()} />);
    expect(input("就寝(前の夜)（時）").value).toBe("23");
    expect(input("就寝(前の夜)（分）").value).toBe("30");
    expect(input("起床（時）").value).toBe("6");
    expect(input("起床（分）").value).toBe("5");
    expect(input("朝の体重").value).toBe("98.30");
    expect(input("朝の体脂肪率").value).toBe("32.0");
    expect(input("夜の振り返り").value).toBe("1 行目\n2 行目");
  });

  it("まだ記録が無い日は、どの欄も空欄で出る", () => {
    render(<DayForm date={DATE} initial={empty} action={makeAction()} />);
    expect(input("朝の体重").value).toBe("");
    expect(input("朝の体脂肪率").value).toBe("");
    expect(input("夜の振り返り").value).toBe("");
  });

  it("就寝と起床を「時」「分」で入力すると、\"HH:MM\" に直して送る。空欄は空のまま送る", async () => {
    const user = userEvent.setup();
    const action = makeAction();
    render(<DayForm date={DATE} initial={empty} action={action} />);

    await user.type(input("就寝(前の夜)（時）"), "23");
    await user.type(input("就寝(前の夜)（分）"), "5");
    await user.click(screen.getByRole("button", { name: "保存" }));

    const formData = action.mock.calls[0][1];
    expect(formData.get("sleepBedtime")).toBe("23:05");
    expect(formData.get("sleepWakeTime")).toBe("");
  });

  it("検証に失敗して作り直されても、時刻の入力(25 時 70 分)は欄に残る", async () => {
    const user = userEvent.setup();
    const failed: DayFormState = {
      errors: { sleepBedtime: "就寝時刻は、時を 0〜23、分を 0〜59 で入力してください" },
      values: { ...empty, sleepBedtime: "25:70" },
      submittedAt: 1,
    };
    render(<DayForm date={DATE} initial={empty} action={makeAction(failed)} />);

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText(/就寝時刻は、時を/)).toBeTruthy();
    expect(input("就寝(前の夜)（時）").value).toBe("25");
    expect(input("就寝(前の夜)（分）").value).toBe("70");
  });

  it("入力して保存を押すと、Server Action に値(文字列)が渡る", async () => {
    const user = userEvent.setup();
    const action = makeAction();
    render(<DayForm date={DATE} initial={empty} action={action} />);

    await user.type(input("朝の体重"), "98.3");
    await user.type(input("朝の体脂肪率"), "32");
    await user.type(input("夜の振り返り"), "良い一日");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0][1];
    expect(formData.get("morningWeightKg")).toBe("98.3");
    expect(formData.get("morningBodyFatPercent")).toBe("32");
    expect(formData.get("reflection")).toBe("良い一日");
  });

  it("日付や user_id は、フォームの入力として送らない(日付は URL から決まる)", async () => {
    const user = userEvent.setup();
    const action = makeAction();
    render(<DayForm date={DATE} initial={filled} action={action} />);

    await user.click(screen.getByRole("button", { name: "保存" }));
    const names = [...action.mock.calls[0][1].keys()].filter((name) => !name.startsWith("$ACTION"));
    expect(names.sort()).toEqual(["morningBodyFatPercent", "morningWeightKg", "reflection", "sleepBedtime", "sleepWakeTime"]);
  });

  it("検証に失敗すると、欄ごとのエラーが出て、入力した値が残る", async () => {
    const user = userEvent.setup();
    const action = makeAction({
      errors: { morningWeightKg: "朝の体重(kg)は 20 以上 300 以下の数値で入力してください" },
      values: { morningWeightKg: "abc", morningBodyFatPercent: "32", reflection: "残す文章" },
      submittedAt: 1,
    });
    render(<DayForm date={DATE} initial={empty} action={action} />);

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText(/朝の体重\(kg\)は 20 以上 300 以下/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("入力内容を確認してください");
    expect(input("朝の体重").value).toBe("abc"); // 送った値が残る
    expect(input("夜の振り返り").value).toBe("残す文章");
    expect(input("朝の体重").getAttribute("aria-invalid")).toBe("true");
  });

  it("キャンセルは、その日の詳細へ戻る", () => {
    render(<DayForm date={DATE} initial={empty} action={makeAction()} />);
    expect((screen.getByRole("link", { name: "キャンセル" }) as HTMLAnchorElement).getAttribute("href")).toBe(`/days/${DATE}`);
  });

  it("欄の下に、入力できる範囲(day-limits.ts の app)を出す", () => {
    render(<DayForm date={DATE} initial={empty} action={makeAction()} />);
    expect(screen.getByText(/\(20〜300\)/)).toBeTruthy();
    expect(screen.getByText(/\(3〜60\)/)).toBeTruthy();
  });
});
