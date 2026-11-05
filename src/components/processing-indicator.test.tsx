// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingIndicator, processingStage, ReportProcessingIndicator, reportProcessingStage } from "./processing-indicator";

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
    [2, true, "写真を読み取っています…"],
    [4, true, "写真を読み取っています…"],
    [5, true, "品目を見つけています…"],
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

describe("ProcessingIndicator", () => {
  it("処理中の印(status)と、最初のメッセージ、0 秒、目安の説明を出す", () => {
    render(<ProcessingIndicator hasPhoto={false} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("AI に送っています");
    expect(status.textContent).toContain("0 秒");
    expect(status.textContent).toContain("10 秒ほどかかる");
  });

  it("1 秒ごとに経過秒数が増え、段階のメッセージが切り替わる(止まって見えない)", () => {
    render(<ProcessingIndicator hasPhoto />);
    const status = () => screen.getByRole("status").textContent ?? "";

    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toContain("3 秒");
    expect(status()).toContain("写真を読み取っています");

    act(() => vi.advanceTimersByTime(3000));
    expect(status()).toContain("6 秒");
    expect(status()).toContain("品目を見つけています");

    act(() => vi.advanceTimersByTime(5000));
    expect(status()).toContain("11 秒");
    expect(status()).toContain("栄養素を計算しています");
  });

  it("外すと、タイマーが止まる(外したあとに更新しない)", () => {
    const { unmount } = render(<ProcessingIndicator hasPhoto={false} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("動く装飾(帯・回る輪)は、読み上げの対象から外す(aria-hidden)", () => {
    const { container } = render(<ProcessingIndicator hasPhoto={false} />);
    expect(container.querySelectorAll("[aria-hidden]").length).toBeGreaterThanOrEqual(3);
  });
});

describe("reportProcessingStage(AI レポートの作成。30 秒ほど、長いときは 1〜2 分)", () => {
  it.each([
    [0, "記録を集めて、AI に送っています…"],
    [2, "記録を集めて、AI に送っています…"],
    [3, "日ごとの記録を読んでいます…"],
    [7, "日ごとの記録を読んでいます…"],
    [8, "睡眠・食事・運動のつながりを探しています…"],
    [19, "睡眠・食事・運動のつながりを探しています…"],
    [20, "気づきを文章にまとめています…"],
    [44, "気づきを文章にまとめています…"],
    [45, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [89, "時間がかかっています。そのまま、もう少しお待ちください…"],
    [90, "混み合っているようです。まだ続けています。最長で 2 分ほどかかります…"],
    [240, "混み合っているようです。まだ続けています。最長で 2 分ほどかかります…"],
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
    expect(status.textContent).toContain("30 秒ほどかかります");
    expect(status.textContent).toContain("ページを閉じても、作成は続きます"); // 裏で続くので、閉じてよい(あとで一覧から開ける)
    expect(status.textContent).not.toContain("%");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("status").textContent).toContain("3 秒");
    expect(screen.getByRole("status").textContent).toContain("日ごとの記録を読んでいます");
  });
});
