// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealEstimate } from "@/lib/meal-estimate";
import { isBefore, isFirstChild, isLastChild } from "./dom-order";
import { MealForm } from "./meal-form";

const actions = vi.hoisted(() => ({
  estimateMealAction: vi.fn(),
  saveMealAction: vi.fn(),
  updateMealAction: vi.fn(),
  deleteMealAction: vi.fn(),
}));
vi.mock("@/app/(app)/days/[date]/meals/actions", () => actions);

const resize = vi.hoisted(() => ({ resizeImageToDataUrl: vi.fn() }));
vi.mock("@/lib/image-resize", () => resize);

// 今日を固定する(ローカル時間の 2026-10-30 12:05)。Date だけを偽物にして、user-event のタイマーには触らない
function setNow(...args: [number, number, number, number, number]) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(...args));
}

beforeEach(() => {
  setNow(2026, 9, 30, 12, 5);
  for (const action of Object.values(actions)) action.mockReset();
  resize.resizeImageToDataUrl.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DATE = "2026-10-30";
const estimate: MealEstimate = {
  dishName: "焼鮭定食",
  description: "焼鮭1切れ、白ご飯、みそ汁",
  items: [
    { name: "焼鮭", amount: "1切れ 約80g", kcal: 150, proteinG: 18, fatG: 8, carbohydrateG: 0, fiberG: 0, saltG: 1.4 },
    { name: "白ご飯", amount: "約150g", kcal: 252, proteinG: 3.8, fatG: 0.5, carbohydrateG: 55.7, fiberG: 0.5, saltG: 0 },
  ],
  totals: { kcal: 402, proteinG: 21.8, fatG: 8.5, netCarbG: 55.2, fiberG: 0.5, saltG: 1.4 },
};

// 呼ばれたあとに、手動で解決できる Promise(処理中の表示を確かめるため)
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  pendingPromises.push(() => resolve(undefined as T)); // テストが途中で落ちても、終わりに解決する
  return { promise, resolve };
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const cancelLink = () => screen.getByRole("link", { name: "キャンセル" });

// 解決されない Promise を残したテストが、あとのテストを巻き込まないよう、終わりに必ず解決する
const pendingPromises: Array<() => void> = [];
afterEach(async () => {
  await act(async () => {
    for (const resolve of pendingPromises.splice(0)) resolve();
  });
});

describe("MealForm: 食べた時刻の初期値", () => {
  it("今日の食事なら、今の時刻が入り、昼食のバッジが付く", () => {
    render(<MealForm date={DATE} mode="new" />);
    expect(field("食べた時刻（時）").value).toBe("12");
    expect(field("食べた時刻（分）").value).toBe("5");
    expect(screen.getByText("昼食")).toBeTruthy();
  });

  it("別の日の食事なら、時刻は空で、バッジも出ない(自分で入れる)", () => {
    render(<MealForm date="2026-10-01" mode="new" />);
    expect(field("食べた時刻（時）").value).toBe("");
    expect(screen.queryByText("昼食")).toBeNull();
  });

  it("午前 3 時より前は、前の日の食事(24 を足した時刻)になる: 01:30 → 前日の 25:30、夜食", () => {
    setNow(2026, 9, 30, 1, 30);
    render(<MealForm date="2026-10-29" mode="new" />);
    expect(field("食べた時刻（時）").value).toBe("25");
    expect(field("食べた時刻（分）").value).toBe("30");
    expect(screen.getByText("夜食")).toBeTruthy();
  });

  it("午前 3 時より前でも、今日の日付の画面なら、初期値は入れない", () => {
    setNow(2026, 9, 30, 1, 30);
    render(<MealForm date="2026-10-30" mode="new" />);
    expect(field("食べた時刻（時）").value).toBe("");
  });

  it("別の日の食事は、時刻の欄に、入れる例(12 と 30)が薄く出る", () => {
    render(<MealForm date="2026-10-01" mode="new" />);
    expect(field("食べた時刻（時）").placeholder).toBe("12");
    expect(field("食べた時刻（分）").placeholder).toBe("30");
  });

  it("時刻が空のまま推定すると、保存できない理由が出る。時刻を入れると、理由が消えて保存できる", async () => {
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date="2026-10-01" mode="new" />);
    expect(screen.queryByText(/食べた時刻を入れてください/)).toBeNull(); // 触る前は、出さない
    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });

    expect(button("この内容で保存").disabled).toBe(true);
    expect(screen.getByText(/食べた時刻を入れてください/)).toBeTruthy();

    await user.type(field("食べた時刻（時）"), "12");
    await user.type(field("食べた時刻（分）"), "30");
    expect(screen.queryByText(/食べた時刻を入れてください/)).toBeNull();
    expect(button("この内容で保存").disabled).toBe(false);
  });

  it("時刻を入れると、バッジが変わる(11:00〜13:59 は昼食、19 時は夕食、15 時は間食)", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    await user.clear(field("食べた時刻（時）"));
    await user.type(field("食べた時刻（時）"), "19");
    await user.clear(field("食べた時刻（分）"));
    await user.type(field("食べた時刻（分）"), "30");
    expect(screen.getByText("夕食")).toBeTruthy();

    await user.clear(field("食べた時刻（時）"));
    await user.type(field("食べた時刻（時）"), "15");
    expect(screen.getByText("間食")).toBeTruthy();
  });
});

describe("MealForm: 午前 3 時より前の案内(深夜の食事は前の日の記録)", () => {
  it("午前 3 時より前に、今日の日付の画面で追加するときは、前の日に追加するリンクを出す", () => {
    setNow(2026, 9, 30, 1, 30);
    render(<MealForm date="2026-10-30" mode="new" />);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("午前 3 時より前です");
    expect(note.textContent).toContain("前の日(2026-10-29)の記録");
    const link = within(note).getByRole("link", { name: "2026-10-29 に追加する" });
    expect(link.getAttribute("href")).toBe("/days/2026-10-29/meals/new");
    expect(field("食べた時刻（時）").value).toBe(""); // 今日の日付の画面では、時刻は空のまま(勝手には移さない)
  });

  it.each([
    ["すでに前の日の画面", () => setNow(2026, 9, 30, 1, 30), "2026-10-29"],
    ["午前 3 時ちょうど", () => setNow(2026, 9, 30, 3, 0), "2026-10-30"],
    ["昼", () => setNow(2026, 9, 30, 12, 5), "2026-10-30"],
    ["今日ではない日の画面", () => setNow(2026, 9, 30, 1, 30), "2026-10-01"],
  ])("案内は出ない: %s", (_label, setup, date) => {
    setup();
    render(<MealForm date={date} mode="new" />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("編集の画面では、案内は出ない", () => {
    setNow(2026, 9, 30, 1, 30);
    render(<MealForm date="2026-10-30" mode="edit" mealId={1} initial={{ eatenTime: "12:00", estimate }} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("推定が出たあとは、案内を消す(入力の段階だけで出す)", async () => {
    setNow(2026, 9, 30, 1, 30);
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date="2026-10-30" mode="new" />);
    expect(screen.getByRole("note")).toBeTruthy();

    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("MealForm: 推定", () => {
  it("文章も写真も無いうちは、推定のボタンを押せない", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    expect(button("AI で推定する").disabled).toBe(true);
    await user.type(field("食べたもの"), "焼鮭定食");
    expect(button("AI で推定する").disabled).toBe(false);
  });

  it("推定中は「処理中」の表示が出て、入力と推定のボタンが止まる。終わると推定が出て、説明が整えた文に置き換わる", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: true; estimate: MealEstimate }>();
    actions.estimateMealAction.mockReturnValue(pending.promise);
    render(<MealForm date={DATE} mode="new" />);

    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));

    // 処理中: 動く印(role=status)、ボタンの表示、入力が止まる
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "焼鮭定食", imageDataUrls: [] });
    expect(screen.getByRole("status").textContent).toContain("AI に送っています");
    expect(button("推定中...").disabled).toBe(true);
    expect(field("食べたもの").matches(":disabled")).toBe(true); // fieldset の disabled は、:disabled に当たる
    expect(screen.queryByText("この内容で保存")).toBeNull();

    await act(async () => pending.resolve({ ok: true, estimate }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("heading", { name: "焼鮭定食" })).toBeTruthy();
    expect(screen.getByText("402")).toBeTruthy();
    expect(screen.getByText("焼鮭")).toBeTruthy();
    expect(screen.getByText("1切れ 約80g")).toBeTruthy();
    expect(field("説明").value).toBe("焼鮭1切れ、白ご飯、みそ汁"); // AI が整えた説明に置き換わる
    expect(button("この内容で保存").disabled).toBe(false);
    expect(button("推定し直す")).toBeTruthy();
  });

  it("推定に失敗したら、メッセージを出し、推定は出さない(保存もできない)", async () => {
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValue({ ok: false, message: "AI の利用回数の上限に達しました。" });
    render(<MealForm date={DATE} mode="new" />);

    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));

    expect((await screen.findByRole("alert")).textContent).toContain("利用回数の上限");
    expect(screen.queryByText("この内容で保存")).toBeNull();
    await waitFor(() => expect(button("AI で推定する").disabled).toBe(false)); // やり直せる(処理が終わるまで、少し待つ)
  });

  it("説明を直すと、保存できなくなり(数字と説明が食い違うため)、推定し直すと保存できる", async () => {
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValueOnce({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);
    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });

    await user.type(field("説明"), "、右上はいくら");
    expect(button("この内容で保存").disabled).toBe(true);
    expect(screen.getByText(/説明を変えました/)).toBeTruthy();

    const reestimate = { ...estimate, dishName: "焼鮭定食(いくら付き)", description: "焼鮭1切れ、白ご飯、みそ汁、いくら" };
    actions.estimateMealAction.mockResolvedValueOnce({ ok: true, estimate: reestimate });
    await user.click(button("推定し直す"));

    // 直した説明(と、写真があれば写真)で、もう一度推定する
    expect(actions.estimateMealAction).toHaveBeenLastCalledWith({ text: "焼鮭1切れ、白ご飯、みそ汁、右上はいくら", imageDataUrls: [] });
    expect(await screen.findByRole("heading", { name: "焼鮭定食(いくら付き)" })).toBeTruthy();
    expect(button("この内容で保存").disabled).toBe(false);
  });

  it("説明を直して、元の文に戻せば、保存できる(推定し直す必要はない)", async () => {
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);
    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });

    await user.type(field("説明"), "x");
    expect(button("この内容で保存").disabled).toBe(true);
    await user.type(field("説明"), "{Backspace}");
    expect(button("この内容で保存").disabled).toBe(false);
  });
});

describe("MealForm: 写真(最大 4 枚)", () => {
  const photoFile = (name: string) => new File(["dummy"], name, { type: "image/jpeg" });
  const file = photoFile("meal.jpg");
  const okResize = (label: string) => ({ ok: true, dataUrl: `data:image/jpeg;base64,${label}` });

  it("写真を選ぶ欄は、「写真を選ぶ」ボタンとして見える(ブラウザ標準の、文章だけの欄ではない)。選ぶと「写真を追加」になり、枚数が出る", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("A"));
    render(<MealForm date={DATE} mode="new" />);

    const choose = screen.getByText("写真を選ぶ").closest("label");
    expect(choose?.getAttribute("for")).toBe("meal-photo"); // このボタンを押すと、ファイルの選択が開く
    expect(field("写真").className).toContain("sr-only"); // 入力欄そのものは見えない
    expect(screen.getByText("0 / 4 枚")).toBeTruthy();

    await user.upload(field("写真"), file);
    expect(await screen.findByText("写真を追加")).toBeTruthy();
    expect(screen.queryByText("写真を選ぶ")).toBeNull();
    expect(screen.getByText("1 / 4 枚")).toBeTruthy();
  });

  it("写真を選ぶと縮小され、サムネイルが出て、推定に写真が付く(文章が空でも推定できる)", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("A"));
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), file);
    expect(await screen.findByRole("img", { name: "選んだ写真 1" })).toBeTruthy();
    expect(resize.resizeImageToDataUrl).toHaveBeenCalledWith(file);

    await user.click(button("AI で推定する"));
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "", imageDataUrls: ["data:image/jpeg;base64,A"] });
  });

  it("何枚か追加でき、推定には、足した順に全部が付く。1 枚ずつ外せる", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValueOnce(okResize("A")).mockResolvedValueOnce(okResize("B")).mockResolvedValueOnce(okResize("C"));
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), photoFile("a.jpg"));
    await user.upload(field("写真"), photoFile("b.jpg"));
    await user.upload(field("写真"), photoFile("c.jpg"));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    expect(screen.getByText("3 / 4 枚")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "写真 2 を外す" })); // B を外す
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByText("2 / 4 枚")).toBeTruthy();

    await user.click(button("AI で推定する"));
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "", imageDataUrls: ["data:image/jpeg;base64,A", "data:image/jpeg;base64,C"] });
  });

  it("同じ写真を何枚選んでも、1 枚にまとめる(1 回分として扱う)。まとめたことを知らせる", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("SAME")); // どのファイルも、縮小した結果が同じ
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), [photoFile("a.jpg"), photoFile("a-copy.jpg"), photoFile("a-copy2.jpg"), photoFile("a-copy3.jpg")]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    expect(screen.getByText("同じ写真は、1 枚にまとめました。")).toBeTruthy();
    expect(screen.getByText("1 / 4 枚")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull(); // エラーではない

    await user.type(field("食べたもの"), "これ 4 人前食べた");
    await user.click(button("AI で推定する"));
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "これ 4 人前食べた", imageDataUrls: ["data:image/jpeg;base64,SAME"] });
  });

  it("すでにある写真と同じ写真を、あとから足しても、足さない", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("SAME"));
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), photoFile("a.jpg"));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    await user.upload(field("写真"), photoFile("b.jpg"));
    await waitFor(() => expect(screen.getByText("同じ写真は、1 枚にまとめました。")).toBeTruthy());
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("一度に何枚か選べる(複数選択の入力欄)", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValueOnce(okResize("A")).mockResolvedValueOnce(okResize("B"));
    render(<MealForm date={DATE} mode="new" />);

    expect((field("写真") as HTMLInputElement).multiple).toBe(true);
    await user.upload(field("写真"), [photoFile("a.jpg"), photoFile("b.jpg")]);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(resize.resizeImageToDataUrl).toHaveBeenCalledTimes(2);
  });

  it("4 枚になると、それ以上は足せない(ボタンの表示が変わり、入力欄が止まる)。1 枚外すと、また足せる", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockImplementation(async (f: File) => okResize(f.name));
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), ["a", "b", "c", "d"].map((name) => photoFile(name)));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(4));
    expect(screen.getByText("写真は 4 枚までです")).toBeTruthy();
    expect(field("写真").matches(":disabled")).toBe(true);

    await user.click(screen.getByRole("button", { name: "写真 1 を外す" }));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    expect(field("写真").matches(":disabled")).toBe(false);
    expect(screen.getByText("写真を追加")).toBeTruthy();
  });

  it("4 枚を超えて選んだときは、足せる分だけ足し、理由を出す(5 枚目以降は縮小もしない)", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockImplementation(async (f: File) => okResize(f.name));
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), ["a", "b", "c", "d", "e", "f"].map((name) => photoFile(name)));
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(4));
    expect(screen.getByRole("alert").textContent).toContain("写真は 4 枚までです。4 枚だけ足しました。");
    expect(resize.resizeImageToDataUrl).toHaveBeenCalledTimes(4);
  });

  it("縮小している間は、ボタンの表示が「縮小しています…」に変わり、入力欄が止まる。その間は推定できない", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: true; dataUrl: string }>();
    resize.resizeImageToDataUrl.mockReturnValue(pending.promise);
    render(<MealForm date={DATE} mode="new" />);
    await user.type(field("食べたもの"), "焼鮭定食");

    await user.upload(field("写真"), file);
    expect(screen.getByText("縮小しています…")).toBeTruthy();
    expect(field("写真").matches(":disabled")).toBe(true);
    expect(button("AI で推定する").disabled).toBe(true);

    await act(async () => pending.resolve({ ok: true, dataUrl: "data:image/jpeg;base64,A" }));
    expect(button("AI で推定する").disabled).toBe(false);
  });

  it("写真を読み込めなかったら、メッセージを出し、その写真は付かない(読めた写真は残る)", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl
      .mockResolvedValueOnce(okResize("A"))
      .mockResolvedValueOnce({ ok: false, message: "この写真を読み込めませんでした。" });
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), [photoFile("a.jpg"), photoFile("b.heic")]);
    expect((await screen.findByRole("alert")).textContent).toContain("読み込めませんでした");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("全部の写真を外すと、写真なしに戻る(推定に写真は付かない)", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("A"));
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), file);
    await user.click(await screen.findByRole("button", { name: "写真 1 を外す" }));
    await waitFor(() => expect(screen.queryByRole("img")).toBeNull());

    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "焼鮭定食", imageDataUrls: [] });
  });

  it("写真があるときの処理中の表示は、写真を読み取る段階を含む", async () => {
    const user = userEvent.setup();
    resize.resizeImageToDataUrl.mockResolvedValue(okResize("A"));
    const pending = deferred<{ ok: false; message: string }>();
    actions.estimateMealAction.mockReturnValue(pending.promise);
    render(<MealForm date={DATE} mode="new" />);

    await user.upload(field("写真"), file);
    await screen.findByRole("img", { name: "選んだ写真 1" });
    await user.click(button("AI で推定する"));
    expect(screen.getByRole("status").textContent).toContain("AI に送っています");

    // 最後に終わらせる(React は、終わっていない非同期の処理を、他のテストにも持ち越すため)
    await act(async () => pending.resolve({ ok: false, message: "x" }));
  });
});

describe("MealForm: 保存", () => {
  async function estimated(user: ReturnType<typeof userEvent.setup>) {
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });
  }

  it("ボタンの並び(推定する前): キャンセル(左)→ AI で推定する(右端、濃い色)", () => {
    render(<MealForm date={DATE} mode="new" />);
    expect(isBefore(cancelLink(), button("AI で推定する"))).toBe(true);
    expect(isLastChild(button("AI で推定する"))).toBe(true);
    expect(button("AI で推定する").className).toContain("bg-zinc-900");
    expect(cancelLink().className).toContain("bg-zinc-200");
    expect(cancelLink().className).toContain("py-2"); // 高さはそろえる
    expect(button("AI で推定する").className).toContain("py-2");
    expect(button("AI で推定する").className).toContain("min-w-24");
  });

  it("ボタンの並び(推定したあと): キャンセル(左)→ この内容で保存(右端、濃い色)。キャンセルは1つだけ", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);

    expect(screen.getAllByRole("link", { name: "キャンセル" })).toHaveLength(1);
    expect(isBefore(cancelLink(), button("この内容で保存"))).toBe(true);
    expect(isLastChild(button("この内容で保存"))).toBe(true);
    expect(button("この内容で保存").className).toContain("bg-zinc-900");
  });

  it("推定し直している間も、キャンセルは1つだけ出る(押せば戻れる)", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);
    await user.type(field("説明"), "と納豆");

    const pending = deferred<{ ok: true; estimate: MealEstimate }>();
    actions.estimateMealAction.mockReturnValue(pending.promise);
    await user.click(button("推定し直す"));
    expect(screen.getByRole("status")).toBeTruthy(); // 推定中
    expect(screen.getAllByRole("link", { name: "キャンセル" })).toHaveLength(1);
    expect(isBefore(cancelLink(), button("推定中..."))).toBe(true);

    await act(async () => pending.resolve({ ok: true, estimate }));
    expect(screen.getAllByRole("link", { name: "キャンセル" })).toHaveLength(1);
    expect(isBefore(cancelLink(), button("この内容で保存"))).toBe(true);
  });

  it("推定したあと、説明を変えていない間の「推定し直す」はグレー(決定は保存)。説明を変えると、押す必要があるので濃い色に戻る", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);
    expect(button("推定し直す").className).toContain("bg-zinc-200");
    expect(button("推定し直す").className).not.toContain("bg-zinc-900");

    await user.type(field("説明"), "と納豆");
    expect(button("推定し直す").className).toContain("bg-zinc-900");
  });

  it("推定しただけでは、何も保存されない。「この内容で保存」を押すと、日付・時刻・推定(合計は含めない)を送る", async () => {
    const user = userEvent.setup();
    actions.saveMealAction.mockResolvedValue({ ok: false, errors: {} });
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);
    expect(actions.saveMealAction).not.toHaveBeenCalled();

    await user.click(button("この内容で保存"));

    expect(actions.saveMealAction).toHaveBeenCalledTimes(1);
    const [date, payload] = actions.saveMealAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(date).toBe(DATE);
    expect(payload).toEqual({
      eatenTime: "12:05",
      estimate: { dishName: "焼鮭定食", description: "焼鮭1切れ、白ご飯、みそ汁", items: estimate.items },
    });
    expect(JSON.stringify(payload)).not.toContain("totals"); // 合計は送らない(保存する側が計算し直す)
  });

  it("保存の検証に失敗したら、エラーを出す(欄ごと・全体)。やり直せる", async () => {
    const user = userEvent.setup();
    actions.saveMealAction.mockResolvedValue({ ok: false, errors: { eatenTime: "食べた時刻は、時を 0〜26 で入力してください", form: "推定の内容が正しくありません。" } });
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);
    await user.click(button("この内容で保存"));

    expect(await screen.findByText("食べた時刻は、時を 0〜26 で入力してください")).toBeTruthy();
    expect(screen.getByText("推定の内容が正しくありません。")).toBeTruthy();
    expect(button("この内容で保存").disabled).toBe(false);
  });

  it("保存中は、ボタンが「保存中...」で止まる", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ ok: false; errors: Record<string, never> }>();
    actions.saveMealAction.mockReturnValue(pending.promise);
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);
    await user.click(button("この内容で保存"));

    expect(button("保存中...").disabled).toBe(true);
    await act(async () => pending.resolve({ ok: false, errors: {} }));
    expect(button("この内容で保存").disabled).toBe(false);
  });

  it("食べた時刻が不正(27 時)なら、保存できない", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="new" />);
    await estimated(user);

    await user.clear(field("食べた時刻（時）"));
    await user.type(field("食べた時刻（時）"), "27");
    expect(button("この内容で保存").disabled).toBe(true);
    await user.clear(field("食べた時刻（時）"));
    await user.type(field("食べた時刻（時）"), "25");
    expect(button("この内容で保存").disabled).toBe(false);
  });
});

describe("MealForm: 編集", () => {
  const initial = { eatenTime: "13:30", estimate };

  it("保存済みの内容から始まる(時刻・推定・説明)。保存すると、更新の Action を呼ぶ", async () => {
    const user = userEvent.setup();
    actions.updateMealAction.mockResolvedValue({ ok: false, errors: {} });
    render(<MealForm date={DATE} mode="edit" mealId={7} initial={initial} />);

    expect(field("食べた時刻（時）").value).toBe("13");
    expect(field("食べた時刻（分）").value).toBe("30");
    expect(screen.getByText("昼食")).toBeTruthy();
    expect(field("説明").value).toBe("焼鮭1切れ、白ご飯、みそ汁");
    expect(screen.queryByLabelText("別名(任意)")).toBeNull(); // 別名の機能は、なくした
    expect(screen.getByRole("heading", { name: "焼鮭定食" })).toBeTruthy();

    await user.click(button("この内容で保存"));
    expect(actions.saveMealAction).not.toHaveBeenCalled();
    expect(actions.updateMealAction).toHaveBeenCalledWith(7, expect.objectContaining({ eatenTime: "13:30" }));
  });

  it("削除は、確認を挟む。「やめる」で戻れ、「削除する」で削除の Action を呼ぶ", async () => {
    const user = userEvent.setup();
    actions.deleteMealAction.mockResolvedValue(undefined);
    render(<MealForm date={DATE} mode="edit" mealId={7} initial={initial} />);

    await user.click(button("削除"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("元に戻せません");
    expect(actions.deleteMealAction).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "やめる" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(button("削除"));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(actions.deleteMealAction).toHaveBeenCalledWith(7));
  });

  it("追加のときは、削除のボタンが無い", async () => {
    const user = userEvent.setup();
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate });
    render(<MealForm date={DATE} mode="new" />);
    await user.type(field("食べたもの"), "焼鮭定食");
    await user.click(button("AI で推定する"));
    await screen.findByRole("heading", { name: "焼鮭定食" });
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("編集で説明を直すと、推定し直すまで保存できない", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="edit" mealId={7} initial={initial} />);
    fireEvent.change(field("説明"), { target: { value: "焼鮭2切れ、白ご飯" } });
    expect(button("この内容で保存").disabled).toBe(true);
    actions.estimateMealAction.mockResolvedValue({ ok: true, estimate: { ...estimate, description: "焼鮭2切れ、白ご飯" } });
    await user.click(button("推定し直す"));
    await waitFor(() => expect(button("この内容で保存").disabled).toBe(false));
    expect(actions.estimateMealAction).toHaveBeenCalledWith({ text: "焼鮭2切れ、白ご飯", imageDataUrls: [] });
  });

  it("ボタンの並び: 削除(左端に離す)、キャンセル、この内容で保存(右端)。削除の確認は、やめる(左)→ 削除する(右)", async () => {
    const user = userEvent.setup();
    render(<MealForm date={DATE} mode="edit" mealId={7} initial={initial} />);
    const remove = button("削除");
    expect(isFirstChild(remove)).toBe(true);
    expect(remove.parentElement?.contains(cancelLink())).toBe(false); // キャンセル・決定とは別のセル(離して置く)
    expect(isBefore(remove, cancelLink())).toBe(true);
    expect(isBefore(cancelLink(), button("この内容で保存"))).toBe(true);
    expect(isLastChild(button("この内容で保存"))).toBe(true);

    await user.click(remove);
    expect(isBefore(button("やめる"), button("削除する"))).toBe(true);
    expect(button("やめる").className).toContain("bg-zinc-200");
    expect(button("削除する").className).toContain("bg-zinc-900");
    expect(button("やめる").className).toContain("py-2"); // 高さはそろえる
    expect(button("削除する").className).toContain("py-2");
    expect(button("削除する").className).toContain("min-w-24");
  });
});
