// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_INTERVAL_MS, ReportProgress } from "./report-progress";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReportProgress(作成中のレポートの画面)", () => {
  it("経過秒数は、サーバーから渡された値の続きから数える(ページを開き直しても、0 秒に戻らない)", () => {
    render(<ReportProgress elapsedSeconds={50} />);
    expect(screen.getByRole("status").textContent).toContain("50 秒");
    expect(screen.getByRole("status").textContent).toContain("時間がかかっています"); // 45 秒以上の段階
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("status").textContent).toContain("53 秒");
  });

  it("数秒おきに、サーバーに状態を見に行く(できた・失敗に変わったら、ページが切り替わる)。外れたら止まる", () => {
    const { unmount } = render(<ReportProgress elapsedSeconds={0} />);
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    });
    expect(router.refresh).toHaveBeenCalledTimes(3);
    unmount();
    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 3);
    });
    expect(router.refresh).toHaveBeenCalledTimes(3); // 外したら、もう見に行かない
  });

  it("ページを閉じても作成は続くことと、あとで一覧から開けることを、画面で伝える", () => {
    render(<ReportProgress elapsedSeconds={0} />);
    expect(screen.getByRole("status").textContent).toContain("ページを閉じても、作成は続きます");
  });
});
