// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BackLink } from "./back-link";

afterEach(cleanup);

describe("BackLink", () => {
  it("「戻る」のリンクとして、行き先と文言が出る(矢印は読み上げない)", () => {
    const { container } = render(<BackLink href="/">ダッシュボードに戻る</BackLink>);
    const link = screen.getByRole("link", { name: "ダッシュボードに戻る" });
    expect(link.getAttribute("href")).toBe("/");
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("←");
  });

  it("文字だけや、枠線だけではなく、グレーの塗りのボタン(弱い操作)になっている。決定する操作の黒より弱い", () => {
    render(<BackLink href="/days/2026-10-30">2026-10-30 の詳細に戻る</BackLink>);
    const link = screen.getByRole("link");
    expect(link.className).toContain("bg-zinc-200");
    expect(link.className).toContain("dark:bg-zinc-800");
    expect(link.className).not.toContain("bg-zinc-900"); // 黒は、決定する操作だけ
    expect(link.className).not.toContain("border-zinc-300");
  });
});
