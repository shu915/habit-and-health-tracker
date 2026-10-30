// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileForm, type ProfileFormInitial } from "./profile-form";

// 保存の Server Action は使わない(このテストが見るのは、提案ボタンと表示の動き)
const saveProfileAction = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/app/(app)/profile/actions", () => ({ saveProfileAction }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ユーザー本人に近い例: 39 歳・男性・176cm・98.3kg・体脂肪率 32%・活動係数 1.375(軽い)。目標値は未入力
const initial: ProfileFormInitial = {
  gender: "male",
  age: "39",
  heightCm: "176.0",
  currentWeightKg: "98.30",
  currentBodyFatPercent: "32.0",
  currentWaistCm: "",
  activityLevel: "1.375",
  targetWeightKg: "",
  targetCalories: "",
  targetProteinG: "",
  targetSleepMinutes: "450",
  targetSleepMidpoint: "03:15",
};

const valueOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const suggestButton = (label: string) => screen.getByRole("button", { name: `${label}を提案` });

describe("ProfileForm: 消費カロリーの目安", () => {
  it("入力値から、基礎代謝と 1 日の消費カロリーの目安を出す", () => {
    render(<ProfileForm initial={initial} />);
    expect(screen.getByText(/1日の消費カロリーの目安: 約 2,494 kcal/)).toBeTruthy();
    expect(screen.getByText(/基礎代謝 1,814 × 1.375/)).toBeTruthy();
  });

  it("活動係数を選び直すと、目安がその場で変わる", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(screen.getByLabelText(/×1.2\s*座りがち/));
    expect(screen.getByText(/約 2,177 kcal/)).toBeTruthy(); // 1814 × 1.2

    await user.click(screen.getByLabelText("未選択", { selector: 'input[name="activityLevel"]' }));
    expect(screen.getByText(/活動係数を選ぶと、1日の消費カロリーの目安が出ます/)).toBeTruthy();
  });

  it("必要な項目が足りないときは、足りない項目を伝える", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={{ ...initial, currentBodyFatPercent: "", age: "" }} />);
    expect(screen.getByText(/年齢の入力が必要です/)).toBeTruthy();

    await user.type(screen.getByLabelText("年齢"), "39");
    expect(screen.getByText(/1日の消費カロリーの目安: 約 2,603 kcal/)).toBeTruthy(); // 体脂肪率が無いので Mifflin-St Jeor 式
  });
});

describe("ProfileForm: 睡眠時間の目標(時間と分の欄)", () => {
  // 送られるのは、裏の hidden の入力(分に変換した値)
  const sentMinutes = (container: HTMLElement) =>
    (container.querySelector('input[name="targetSleepMinutes"]') as HTMLInputElement).value;

  it("保存済みの 450 分を、「7 時間」「30 分」の欄に分けて出し、送る値は 450 のまま", () => {
    const { container } = render(<ProfileForm initial={initial} />);
    expect((screen.getByLabelText("睡眠時間の目標（時間）") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("睡眠時間の目標（分）") as HTMLInputElement).value).toBe("30");
    expect(sentMinutes(container)).toBe("450");
  });

  it("時間と分を直すと、送る値(分)が変わる", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileForm initial={initial} />);

    await user.clear(screen.getByLabelText("睡眠時間の目標（時間）"));
    await user.type(screen.getByLabelText("睡眠時間の目標（時間）"), "8");
    await user.clear(screen.getByLabelText("睡眠時間の目標（分）"));
    await user.type(screen.getByLabelText("睡眠時間の目標（分）"), "15");
    expect(sentMinutes(container)).toBe("495"); // 8 × 60 + 15
  });

  it("両方を空にすると、空(睡眠の機能を使わない)として送る。片方だけ空なら 0 として扱う", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileForm initial={initial} />);

    await user.clear(screen.getByLabelText("睡眠時間の目標（分）"));
    expect(sentMinutes(container)).toBe("420"); // 7 時間 + 空
    await user.clear(screen.getByLabelText("睡眠時間の目標（時間）"));
    expect(sentMinutes(container)).toBe("");
  });

  it("未入力の人は、2 つの欄が空で、空を送る", () => {
    const { container } = render(<ProfileForm initial={{ ...initial, targetSleepMinutes: "" }} />);
    expect((screen.getByLabelText("睡眠時間の目標（時間）") as HTMLInputElement).value).toBe("");
    expect(sentMinutes(container)).toBe("");
  });

  it("見えている 2 つの欄は、サーバーに送らない(送るのは分の hidden だけ)", () => {
    const { container } = render(<ProfileForm initial={initial} />);
    const form = container.querySelector("form") as HTMLFormElement;
    const names = [...new FormData(form).keys()];
    expect(names.filter((name) => name === "targetSleepMinutes")).toHaveLength(1);
  });
});

describe("ProfileForm: 睡眠の中間時刻(時と分の欄)", () => {
  const sentTime = (container: HTMLElement) =>
    (container.querySelector('input[name="targetSleepMidpoint"]') as HTMLInputElement).value;

  it("保存済みの \"03:15\" を、「3 時」「15 分」の欄に分けて出し、送る値は \"03:15\" のまま", () => {
    const { container } = render(<ProfileForm initial={initial} />);
    expect((screen.getByLabelText("睡眠の中間時刻（時）") as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("睡眠の中間時刻（分）") as HTMLInputElement).value).toBe("15");
    expect(sentTime(container)).toBe("03:15");
  });

  it("時と分を直すと、送る値(HH:MM)が変わる。ブラウザの時刻選択(type=time)は使わない", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileForm initial={initial} />);

    await user.clear(screen.getByLabelText("睡眠の中間時刻（時）"));
    await user.type(screen.getByLabelText("睡眠の中間時刻（時）"), "23");
    await user.clear(screen.getByLabelText("睡眠の中間時刻（分）"));
    await user.type(screen.getByLabelText("睡眠の中間時刻（分）"), "5");
    expect(sentTime(container)).toBe("23:05");
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it("両方を空にすると、空(睡眠の機能を使わない)として送る", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileForm initial={initial} />);

    await user.clear(screen.getByLabelText("睡眠の中間時刻（時）"));
    await user.clear(screen.getByLabelText("睡眠の中間時刻（分）"));
    expect(sentTime(container)).toBe("");
  });

  it("睡眠時間の欄と、同じ入力のしかた(数字の 2 つの欄)になっている", () => {
    render(<ProfileForm initial={initial} />);
    for (const label of ["睡眠時間の目標（時間）", "睡眠時間の目標（分）", "睡眠の中間時刻（時）", "睡眠の中間時刻（分）"]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.type).toBe("text");
      expect(input.inputMode).toBe("numeric");
    }
  });
});

describe("ProfileForm: 目標値の提案(各欄の「提案」ボタン)", () => {
  it("押した欄だけが埋まり、根拠が出て、保存はされない", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(suggestButton("目標体重"));

    expect(valueOf("目標体重")).toBe("93.4");
    expect(screen.getByText(/現在の体重 98.3kg の 5% 減/)).toBeTruthy();
    expect(valueOf("目標カロリー")).toBe(""); // 押していない欄は空のまま
    expect(valueOf("目標タンパク質")).toBe("");
    expect(saveProfileAction).not.toHaveBeenCalled(); // 入力欄を埋めただけで、保存していない
  });

  it("3 つを順に押すと、前の結果を使って提案される", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(suggestButton("目標体重"));
    await user.click(suggestButton("目標カロリー"));
    await user.click(suggestButton("目標タンパク質"));

    expect(valueOf("目標体重")).toBe("93.4");
    expect(valueOf("目標カロリー")).toBe("2120");
    expect(valueOf("目標タンパク質")).toBe("131");
    expect(screen.getAllByText(/提案の根拠:/)).toHaveLength(3); // 先に押した欄の根拠も残る
    expect(screen.getByText(/基礎代謝 1814 × 1.375/)).toBeTruthy();
  });

  it("目標体重が空のまま目標カロリーを押すと、5% 減の目標体重を仮定して、そう表示する(目標体重の欄は埋めない)", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(suggestButton("目標カロリー"));

    expect(valueOf("目標カロリー")).toBe("2120");
    expect(screen.getByText(/目標体重が空なので、93.4kg を仮定/)).toBeTruthy();
    expect(valueOf("目標体重")).toBe("");
  });

  it("提案のあとも、ほかの欄に入力していた値と、選んでいた項目が残る", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.type(screen.getByLabelText("ウエスト"), "99.5"); // 提案の前に入力していた値
    await user.click(suggestButton("目標カロリー"));

    expect(valueOf("ウエスト")).toBe("99.5");
    expect(valueOf("年齢")).toBe("39");
    expect((screen.getByLabelText("男性") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/×1.375\s*軽い/) as HTMLInputElement).checked).toBe(true);
  });

  it("自分で入れた目標体重は上書きせず、その値でほかの項目を提案する", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.type(screen.getByLabelText("目標体重"), "85");
    await user.click(suggestButton("目標タンパク質"));

    expect(valueOf("目標体重")).toBe("85");
    expect(valueOf("目標タンパク質")).toBe("119"); // 85 × 1.4
    expect(screen.getByText(/目標体重 85kg × 1.4 g\/kg/)).toBeTruthy();
  });

  it("材料が足りない項目は、値を入れず、理由を出す", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={{ ...initial, activityLevel: "" }} />);

    await user.click(suggestButton("目標カロリー"));

    expect(screen.getByText(/活動係数を選ぶ必要があります/)).toBeTruthy();
    expect(valueOf("目標カロリー")).toBe("");
  });

  it("理由が出たあとで、材料をそろえてもう一度押すと、提案できて、理由は消える", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={{ ...initial, activityLevel: "" }} />);

    await user.click(suggestButton("目標カロリー"));
    expect(screen.getByText(/活動係数を選ぶ必要があります/)).toBeTruthy();

    await user.click(screen.getByLabelText(/×1.375\s*軽い/));
    await user.click(suggestButton("目標カロリー"));
    expect(valueOf("目標カロリー")).toBe("2120");
    expect(screen.queryByText(/活動係数を選ぶ必要があります/)).toBeNull();
  });

  it("18 歳未満には提案せず、専門家に相談するよう伝える", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={{ ...initial, age: "17" }} />);

    await user.click(suggestButton("目標体重"));

    expect(screen.getByText(/18 歳以上の方が対象です/)).toBeTruthy();
    expect(valueOf("目標体重")).toBe("");
  });

  it("提案の説明に、目安であって医療上の指示ではないことが、独立した 1 行で書いてある", () => {
    render(<ProfileForm initial={initial} />);
    const note = screen.getByText(/医療上の指示ではありません/);
    expect(note.tagName).toBe("P"); // 説明の段落の続きではなく、別の行
    expect(note.textContent).not.toContain("保存」を押してください");
  });

  it("提案のあとに活動係数を変えて、もう一度押すと、新しい値で提案し直す", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(suggestButton("目標カロリー"));
    expect(valueOf("目標カロリー")).toBe("2120");

    await user.click(screen.getByLabelText(/×1.2\s*座りがち/));
    await user.click(suggestButton("目標カロリー"));
    expect(valueOf("目標カロリー")).toBe("1850"); // 1814 × 1.2 = 2177 → 15% 減で 1850
  });

  it("提案した値を自分で直すと、その欄の「提案の根拠」の表示は消える(ほかの欄の根拠は残る)", async () => {
    const user = userEvent.setup();
    render(<ProfileForm initial={initial} />);

    await user.click(suggestButton("目標体重"));
    await user.click(suggestButton("目標タンパク質"));
    expect(screen.getAllByText(/提案の根拠:/)).toHaveLength(2);

    await user.type(screen.getByLabelText("目標タンパク質"), "0"); // 値を直す
    expect(screen.getAllByText(/提案の根拠:/)).toHaveLength(1);
    expect(screen.getByText(/現在の体重 98.3kg の 5% 減/)).toBeTruthy();
  });
});
