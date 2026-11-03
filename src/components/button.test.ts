import { describe, expect, it } from "vitest";
import { buttonClass } from "./button";

describe("buttonClass", () => {
  it("決定する操作(primary、既定)は真っ黒、弱い操作(secondary)はグレーの塗り", () => {
    expect(buttonClass()).toContain("bg-zinc-900");
    expect(buttonClass({ variant: "primary" })).toContain("bg-zinc-900");
    expect(buttonClass({ variant: "secondary" })).toContain("bg-zinc-200");
    expect(buttonClass({ variant: "secondary" })).not.toContain("bg-zinc-900");
  });

  it("どちらも、ダークモードの色を持つ(黒は白に反転、グレーは暗いグレー)", () => {
    expect(buttonClass()).toContain("dark:bg-zinc-100");
    expect(buttonClass({ variant: "secondary" })).toContain("dark:bg-zinc-800");
  });

  it("小さいサイズは、文字も小さい(text-sm が重ならない)", () => {
    expect(buttonClass({ size: "sm" })).toContain("text-xs");
    expect(buttonClass({ size: "sm" })).not.toContain("text-sm");
    expect(buttonClass({ size: "md" })).toContain("text-sm");
  });

  it("使えなくしたときは、薄くなる", () => {
    expect(buttonClass()).toContain("disabled:opacity-50");
    expect(buttonClass({ variant: "secondary" })).toContain("disabled:opacity-50");
  });

  it("フォームの下のボタン(action): 決定もキャンセルも、高さ・文字の大きさ・最小の幅・左右の余白が同じ", () => {
    const main = buttonClass({ size: "action" });
    const cancel = buttonClass({ variant: "secondary", size: "action" });
    for (const cls of [main, cancel]) {
      for (const token of ["py-2", "px-3", "text-sm", "min-w-24"]) expect(cls).toContain(token);
    }
    expect(main).toContain("bg-zinc-900"); // 決定は濃い色
    expect(cancel).toContain("bg-zinc-200"); // キャンセルはグレー
  });
});
