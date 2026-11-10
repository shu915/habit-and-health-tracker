// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "./back-link";
import { PrintButton } from "./print-button";

beforeEach(() => {
  document.title = "Habit and Health Tracker";
  window.print = vi.fn();
});
afterEach(cleanup);

describe("PrintButton", () => {
  it("押すと印刷を開く。印刷のあいだだけ、題名をレポートの名前にし、終わったら元に戻す(PDF のファイル名のため)", () => {
    let titleWhilePrinting = "";
    vi.mocked(window.print).mockImplementation(() => {
      titleWhilePrinting = document.title;
    });
    render(<PrintButton title="2026-Q3 四半期レポート" />);
    fireEvent.click(screen.getByRole("button", { name: "PDF で保存(印刷)" }));

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(titleWhilePrinting).toBe("2026-Q3 四半期レポート");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Habit and Health Tracker");
  });

  it("印刷が終わった合図が来なくても、2 回押して元の題名を失わない。画面を離れると、題名を戻す", () => {
    const { unmount } = render(<PrintButton title="2026-Q3 四半期レポート" />);
    const print = screen.getByRole("button", { name: "PDF で保存(印刷)" });
    fireEvent.click(print);
    fireEvent.click(print); // afterprint が来ないまま、もう一度
    expect(document.title).toBe("2026-Q3 四半期レポート");

    unmount();
    expect(document.title).toBe("Habit and Health Tracker");
  });

  it("ボタン自体は、印刷には出ない", () => {
    render(<PrintButton title="x" />);
    expect(screen.getByRole("button", { name: "PDF で保存(印刷)" }).className).toContain("print:hidden");
  });
});

describe("印刷で隠す部品", () => {
  it("「戻る」リンクは、印刷には出ない", () => {
    render(<BackLink href="/reports">AI レポートに戻る</BackLink>);
    expect(screen.getByRole("link", { name: /AI レポートに戻る/ }).className).toContain("print:hidden");
  });
});
