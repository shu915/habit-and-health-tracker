// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileSummarySkeleton } from "./profile-summary-skeleton";

afterEach(cleanup);

describe("ProfileSummarySkeleton", () => {
  it("読み上げには「読み込み中」と伝わり、見た目だけの灰色の棒の入れ物は、読み上げの対象から外れる", () => {
    const { container } = render(<ProfileSummarySkeleton />);
    expect(screen.getByRole("status").textContent).toContain("プロフィールを読み込み中...");
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
    // 見出しは、文字なので、そのまま出す
    expect(screen.getByRole("heading", { name: "プロフィール" })).not.toBeNull();
  });

  it("本物と同じ行数の場所を取る(ボディデータ 7 行、目標値の枠は、目標 2 行 + 睡眠 2 行)", () => {
    const { container } = render(<ProfileSummarySkeleton />);
    const cards = container.querySelectorAll(".sm\\:grid-cols-2 > div");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelectorAll("[data-row]")).toHaveLength(7);
    expect(cards[1].querySelectorAll("[data-row]")).toHaveLength(4);
  });

  it("補足が付く行(ウエスト・活動係数)は、ほかの行より背が高い", () => {
    const { container } = render(<ProfileSummarySkeleton />);
    const rows = container.querySelectorAll(".sm\\:grid-cols-2 > div")[0].querySelectorAll("[data-row]");
    expect(Array.from(rows).map((row) => row.classList.contains("h-10.25"))).toEqual([false, false, false, false, false, true, true]);
  });
});
