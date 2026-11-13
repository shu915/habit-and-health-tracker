// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingPanel, processingStage, ReportProcessingIndicator, reportProcessingStage } from "./processing-indicator";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("processingStage", () => {
  it.each([
    [0, false, "AI に送っています…"],
    [1, false, "AI に送っています…"],
    [2, false, "食事の内容を読み取っています…"],
    [3, true, "AI に送っています…"], // 写真つきは、時間の進みが半分(1.5 秒)
    [4, true, "写真を読み取っています…"],
    [9, true, "写真を読み取っています…"],
    [10, true, "品目を見つけています…"],
    [20, true, "栄養素を計算しています…"],
    [36, true, "もう少しで終わります。混み合っているかもしれません…"],
    [79, true, "もう少しで終わります。混み合っているかもしれません…"],
    [80, true, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [9, false, "品目を見つけています…"],
    [10, false, "栄養素を計算しています…"],
    [17, false, "栄養素を計算しています…"],
    [18, false, "もう少しで終わります。混み合っているかもしれません…"],
    [39, false, "もう少しで終わります。混み合っているかもしれません…"],
    [40, false, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [120, true, "時間がかかっています。そのまま、もう少しお待ちください…"],
  ])("%i 秒(写真 %s)は「%s」", (seconds, hasPhoto, message) => {
    expect(processingStage(seconds, hasPhoto)).toBe(message);
  });
});

describe("ProcessingPanel(食事の推定。ボタンの行の上に、最初から置く枠)", () => {
  it("使っていない間は、案内の 1 行と、空の帯と、目安の説明を出す。動きも、タイマーも無い。案内の行は読み上げない", () => {
    const { container } = render(<ProcessingPanel active={false} hasPhoto={false} />);
    expect(container.textContent).toContain("推定すると、ここに進み具合が出ます");
    expect(container.textContent).toContain("10 秒ほどかかる");
    expect(container.querySelector(".indeterminate-bar")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("status").querySelector("[aria-hidden]")?.textContent).toContain("ここに進み具合が出ます"); // 案内は aria-hidden
  });

  it("動き出すと、最初のメッセージと 0 秒が出る(読み上げの領域は同じまま、中身だけ置き換わる)。目安の説明は、そのまま", () => {
    const { rerender, container } = render(<ProcessingPanel active={false} hasPhoto={false} />);
    const region = screen.getByRole("status");
    rerender(<ProcessingPanel active hasPhoto={false} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toContain("AI に送っています");
    expect(region.textContent).toContain("0 秒");
    expect(region.textContent).not.toContain("ここに進み具合が出ます");
    expect(container.textContent).toContain("10 秒ほどかかる");
  });

  it("1 秒ごとに経過秒数が増え、段階のメッセージが切り替わる(止まって見えない)", () => {
    render(<ProcessingPanel active hasPhoto />);
    const status = () => screen.getByRole("status").textContent ?? "";

    // 写真つきは、段階の切り替わりが 2 倍遅い(経過秒数は、そのまま数える)
    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toContain("3 秒");
    expect(status()).toContain("AI に送っています");

    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toContain("6 秒");
    expect(status()).toContain("写真を読み取っています");

    act(() => vi.advanceTimersByTime(5000));
    expect(status()).toContain("11 秒");
    expect(status()).toContain("品目を見つけています");
  });

  it("写真つきのときは、枚数が多いほど時間がかかる、と目安の説明に出す。写真が無ければ、10 秒ほどの説明", () => {
    const { container, rerender } = render(<ProcessingPanel active={false} hasPhoto />);
    expect(container.textContent).toContain("1 分近くかかることもあります");
    expect(container.textContent).not.toContain("10 秒ほどかかる");
    rerender(<ProcessingPanel active={false} hasPhoto={false} />);
    expect(container.textContent).toContain("10 秒ほどかかる");
  });

  it("終わる(使っていない状態に戻る)と、タイマーが止まり、案内に戻る。次に動かすと、0 秒からやり直す", () => {
    const { rerender } = render(<ProcessingPanel active hasPhoto={false} />);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(4000));
    rerender(<ProcessingPanel active={false} hasPhoto={false} />);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("status").textContent).toContain("ここに進み具合が出ます");
    rerender(<ProcessingPanel active hasPhoto={false} />);
    expect(screen.getByRole("status").textContent).toContain("0 秒");
  });

  it("動く装飾(帯・回る輪)は、読み上げの対象から外す(aria-hidden)", () => {
    const { container } = render(<ProcessingPanel active hasPhoto={false} />);
    expect(container.querySelectorAll("[aria-hidden]").length).toBeGreaterThanOrEqual(3);
  });
});

describe("reportProcessingStage(AI レポートの作成。30 秒〜1 分ほど、年次は 1 分ほど、長いときは 2 分以上)", () => {
  it.each([
    [0, "記録を集めて、AI に送っています…"],
    [4, "記録を集めて、AI に送っています…"],
    [5, "日ごとの記録を読んでいます…"],
    [14, "日ごとの記録を読んでいます…"],
    [15, "睡眠・食事・運動のつながりを探しています…"],
    [34, "睡眠・食事・運動のつながりを探しています…"],
    [35, "気づきを文章にまとめています…"],
    [74, "気づきを文章にまとめています…"], // 年次が 1 分ほどかかっても、「時間がかかっています」が出ない
    [75, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [119, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [120, "混み合っているようです。まだ続けています。数分かかることもあります…"],
    [240, "混み合っているようです。まだ続けています。数分かかることもあります…"],
  ])("%i 秒は「%s」", (seconds, message) => {
    expect(reportProcessingStage(seconds)).toBe(message);
  });
});

describe("ReportProcessingIndicator", () => {
  it("処理中の印(status)・最初のメッセージ・0 秒・待ち時間の説明を出し、1 秒ごとに秒数が進み、段階のメッセージが変わる。割合は出さない", () => {
    render(<ReportProcessingIndicator />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("記録を集めて、AI に送っています");
    expect(status.textContent).toContain("0 秒");
    expect(status.textContent).toContain("30 秒〜1 分ほどかかります");
    expect(status.textContent).toContain("ページを閉じても、作成は続きます"); // 裏で続くので、閉じてよい(あとで一覧から開ける)
    expect(status.textContent).not.toContain("%");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("status").textContent).toContain("5 秒");
    expect(screen.getByRole("status").textContent).toContain("日ごとの記録を読んでいます");
  });
});
