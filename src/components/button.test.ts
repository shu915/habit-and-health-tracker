import { describe, expect, it } from "vitest";
import { buttonClass } from "./button";

describe("buttonClass", () => {
  it("決定する操作(primary、既定)は深い緑、弱い操作(secondary)はグレーの塗り", () => {
    expect(buttonClass()).toContain("bg-accent");
    expect(buttonClass({ variant: "primary" })).toContain("bg-accent");
    expect(buttonClass({ variant: "secondary" })).toContain("bg-neutral");
    expect(buttonClass({ variant: "secondary" })).not.toContain("bg-accent");
  });

  it("どちらも、テーマの変数の色を使う(ダークモードは globals.css の変数が切り替える)", () => {
    expect(buttonClass()).toContain("text-on-accent");
    expect(buttonClass({ variant: "secondary" })).toContain("text-ink");
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
    expect(main).toContain("bg-accent"); // 決定は濃い色
    expect(cancel).toContain("bg-neutral"); // キャンセルはグレー
  });
});
