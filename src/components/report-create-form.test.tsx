// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportFormState } from "@/app/(app)/reports/actions";
import { POLL_INTERVAL_MS } from "./report-progress";
import { ReportCreateForm, type MonthView, type OnDemandView } from "./report-create-form";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  router.refresh.mockClear();
});

const onDemand = (overrides: Partial<OnDemandView> = {}): OnDemandView => ({ start: "2026-10-08", end: "2026-11-04", recorded: 24, required: 20, missing: 0, ok: true, creatingId: null, blockedToday: false, ...overrides });
const month = (value: string, overrides: Partial<MonthView> = {}): MonthView => ({ month: value, recorded: 25, required: 22, missing: 0, ok: true, existingId: null, creatingId: null, ...overrides });
// 新しい月が先(先頭 = 先月が初期値)
const months = [month("2026-10"), month("2026-09", { recorded: 12, required: 21, missing: 9, ok: false }), month("2026-08", { existingId: 7 })];
const noop = async () => null;
const saved = { onDemandSaved: <p>随時の一覧です</p>, periodicSaved: <p>定期の一覧です</p> };
const base = { ...saved, onDemand: onDemand(), months, consented: true, action: noop, revokeAction: async () => {} };

describe("ReportCreateForm", () => {
  it("随時レポートと定期レポートは、枠を分ける。随時は直近 4 週間だけ、定期は月次。作ったレポートの一覧も、それぞれの枠の中に出る", () => {
    render(<ReportCreateForm {...base} />);
    const onDemandFrame = within(screen.getByRole("region", { name: "随時レポート" }));
    const periodic = within(screen.getByRole("region", { name: "定期レポート" }));
    expect(onDemandFrame.getByText("直近 4 週間")).toBeTruthy();
    expect(onDemandFrame.queryByText("直近 1 週間")).toBeNull(); // 1 週間は、やめた
    expect(onDemandFrame.getByText("随時の一覧です")).toBeTruthy();
    expect(onDemandFrame.getByText(/1 日に 1 回まで作れて、最新の 1 件だけが残ります/)).toBeTruthy();
    expect(periodic.getByLabelText("作る月")).toBeTruthy();
    expect(periodic.getByText("定期の一覧です")).toBeTruthy();
    expect(periodic.getByText(/同じ月は 1 回だけです/)).toBeTruthy();
  });

  it("定期: 作る月の選択肢は、新しい月が先。初期値は先月。作成済み・記録が足りない月は、選択肢にそう書く", () => {
    render(<ReportCreateForm {...base} />);
    const select = screen.getByLabelText("作る月") as HTMLSelectElement;
    expect(select.value).toBe("2026-10"); // 初期値は先月
    expect([...select.options].map((o) => o.textContent)).toEqual(["2026 年 10 月", "2026 年 9 月(記録が足りません)", "2026 年 8 月(作成済み)"]);
    expect(screen.getByText(/記録のある日 25 日\(作れます\)/)).toBeTruthy();
  });

  it("定期: 月を選ぶと、その月の状態が出る。作れない月・作成済みの月は、押せない(作成済みは、レポートへのリンク)。同じ月は 1 回だけ", async () => {
    const user = userEvent.setup();
    render(<ReportCreateForm {...base} />);
    const periodic = within(screen.getByRole("region", { name: "定期レポート" }));
    const select = periodic.getByLabelText("作る月");
    expect(periodic.getByRole("button", { name: "作る" })).toHaveProperty("disabled", false);

    await user.selectOptions(select, "2026-09");
    expect(periodic.getByText(/記録のある日 12 \/ 21 日。あと 9 日の記録で作れます/)).toBeTruthy();
    expect(periodic.getByRole("button", { name: "作る" })).toHaveProperty("disabled", true);

    await user.selectOptions(select, "2026-08");
    expect(periodic.queryByRole("button", { name: "作る" })).toBeNull(); // 作成済みは、もう作れない
    expect(periodic.getByRole("link", { name: "見る" }).getAttribute("href")).toBe("/reports/7");
    expect(periodic.getByText(/作成済み/, { selector: "p" })).toBeTruthy();
  });

  it("定期: 作成中の月は「作成中」と、作成中の画面へのリンクが出る。作る月が無ければ、その旨を出す", () => {
    render(<ReportCreateForm {...base} months={[month("2026-10", { existingId: 9, creatingId: 9 })]} />);
    expect(screen.getByText(/作成中/, { selector: "p" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "見る" }).getAttribute("href")).toBe("/reports/9");
    cleanup();
    render(<ReportCreateForm {...base} months={[]} />);
    expect(screen.getByText(/作れる月が、まだありません/)).toBeTruthy();
    expect(screen.queryByLabelText("作る月")).toBeNull();
  });

  it("未同意のとき: 同意の説明とチェック(最初は外れている)が出て、チェックを入れるまで「作る」は押せない", async () => {
    const user = userEvent.setup();
    render(<ReportCreateForm {...base} consented={false} />);
    expect(screen.getByText("AI にレポートを作ってもらうことへの同意")).toBeTruthy();
    const checkbox = screen.getByRole("checkbox", { name: /同意します/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false); // 最初から入れない
    const buttons = screen.getAllByRole("button", { name: "作る" });
    expect(buttons[0]).toHaveProperty("disabled", true);
    await user.click(checkbox);
    expect(buttons[0]).toHaveProperty("disabled", false);
  });

  it("同意の説明は、学習には使われないが、一時的に保持されることがある、と正確に書く(「保持しない」とは書かない)", () => {
    render(<ReportCreateForm {...base} consented={false} />);
    expect(screen.getByText(/学習には使われない設定にしていますが、提供元で、データが一時的に保持されることがあります/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("保持や学習に使う提供元には送らない");
  });

  it("同意済みのとき: チェックは出ず、1 行の断り(日記を含む記録を AI に送ります)と、撤回のボタンが出る", () => {
    render(<ReportCreateForm {...base} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/日記を含む記録を AI に送ります/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "同意を撤回する" })).toBeTruthy();
  });

  it("随時: 作れないときは、あと何日の記録で作れるかを出して、押せない", () => {
    render(<ReportCreateForm {...base} onDemand={onDemand({ recorded: 12, missing: 8, ok: false })} />);
    const frame = within(screen.getByRole("region", { name: "随時レポート" }));
    expect(frame.getByText(/記録のある日 12 \/ 20 日。あと 8 日の記録で作れます/)).toBeTruthy();
    expect(frame.getByRole("button", { name: "作る" })).toHaveProperty("disabled", true);
  });

  it("随時: 作成中なら、押せず、作成中の画面へのリンクが出る。今日もう作ったときは、押せず、理由が出る(1 日に 1 回まで)", () => {
    render(<ReportCreateForm {...base} onDemand={onDemand({ creatingId: 5 })} />);
    const frame = within(screen.getByRole("region", { name: "随時レポート" }));
    expect(frame.queryByRole("button", { name: "作る" })).toBeNull();
    expect(frame.getByRole("link", { name: "見る" }).getAttribute("href")).toBe("/reports/5");
    cleanup();
    render(<ReportCreateForm {...base} onDemand={onDemand({ blockedToday: true })} />);
    const blocked = within(screen.getByRole("region", { name: "随時レポート" }));
    expect(blocked.queryByRole("button", { name: "作る" })).toBeNull();
    expect(blocked.getByText(/今日は、もう作りました\(随時レポートは、1 日に 1 回まで\)/)).toBeTruthy();
  });

  it("随時の「作る」は、種類(four-weeks)と同意のチェックを送る。失敗のメッセージを出す", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (state: ReportFormState, formData: FormData): Promise<ReportFormState> => (state === null && formData.has("kind") ? { message: "記録のある日が足りません。" } : null));
    render(<ReportCreateForm {...base} consented={false} action={action} />);
    await user.click(screen.getByRole("checkbox", { name: /同意します/ }));
    await user.click(within(screen.getByRole("region", { name: "随時レポート" })).getByRole("button", { name: "作る" }));
    const formData = action.mock.calls[0][1];
    expect(formData.get("kind")).toBe("four-weeks");
    expect(formData.get("consent")).toBe("on");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "記録のある日が足りません。");
  });

  it("定期の「作る」は、種類(monthly)と、選んだ月(初期値は先月)を送る", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (_state: ReportFormState, formData: FormData): Promise<ReportFormState> => (formData.has("kind") ? null : null));
    const { rerender } = render(<ReportCreateForm {...base} action={action} months={[month("2026-10"), month("2026-07")]} />);
    const periodic = within(screen.getByRole("region", { name: "定期レポート" }));
    await user.click(periodic.getByRole("button", { name: "作る" }));
    expect(action.mock.calls[0][1].get("kind")).toBe("monthly");
    expect(action.mock.calls[0][1].get("month")).toBe("2026-10"); // 初期値は先月
    rerender(<ReportCreateForm {...base} action={action} months={[month("2026-10"), month("2026-07")]} />);
    await user.selectOptions(periodic.getByLabelText("作る月"), "2026-07");
    await user.click(periodic.getByRole("button", { name: "作る" }));
    expect(action.mock.calls[1][1].get("month")).toBe("2026-07");
  });

  it("作成の送信中は、ボタンを押せなくする(連打できない)。画面を覆うローディングは出さない(待たせない。作成は裏で続く)", async () => {
    const user = userEvent.setup();
    const action = vi.fn(() => new Promise<ReportFormState>(() => {})); // 返ってこない(送信中のまま)
    render(<ReportCreateForm {...base} action={action} />);
    await user.click(within(screen.getByRole("region", { name: "随時レポート" })).getByRole("button", { name: "作る" }));
    for (const button of await screen.findAllByRole("button", { name: "作成中..." })) expect(button).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toBe(""); // 読み上げ用の領域は常にあるが、送信中に何かを出す(画面を覆う表示や、帯と秒数)ことはしない
    expect(screen.queryByText(/秒/)).toBeNull();
  });

  it("作成の開始と終わりを、読み上げに伝える(画面は動かさないので、目に見える所だけの変化にしない)", () => {
    const { rerender } = render(<ReportCreateForm {...base} />);
    expect(screen.getByRole("status").textContent).toBe("");
    rerender(<ReportCreateForm {...base} onDemand={onDemand({ creatingId: 5 })} />);
    expect(screen.getByRole("status").textContent).toContain("作成中です");
    rerender(<ReportCreateForm {...base} />);
    expect(screen.getByRole("status").textContent).toContain("作成が終わりました");
  });

  it("作成中のレポートがあるあいだは、同じ画面のまま、数秒おきに状態を見に行く(できたら、一覧が切り替わる)。無ければ、見に行かない", () => {
    vi.useFakeTimers();
    render(<ReportCreateForm {...base} onDemand={onDemand({ creatingId: 5 })} />);
    expect(screen.getByText(/ページを離れても続きます/)).toBeTruthy();
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    expect(router.refresh).toHaveBeenCalledTimes(2);
    cleanup();
    router.refresh.mockClear();
    render(<ReportCreateForm {...base} />);
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
