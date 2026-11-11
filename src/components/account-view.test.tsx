// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountView } from "./account-view";

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn(), linkSocial: vi.fn(), unlinkAccount: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const props = { email: "friend@example.com", googleEnabled: true, googleAccountId: null, failure: null };

describe("AccountView(アカウントのページの表示)", () => {
  it("メールアドレスと、ログイン方法の見出し。メールのリンクは、いつでも使えると、ラベルで示す", () => {
    render(<AccountView {...props} />);
    expect(screen.getByRole("heading", { name: "メールアドレス" })).toBeTruthy();
    expect(screen.getByText("friend@example.com")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "ログイン方法" })).toBeTruthy();
    expect(screen.getByText("使えます")).toBeTruthy();
  });

  it("Google が未連結: 名前の横に「未連結」のラベル(文字つき)、右端に連結するボタン。解除のボタンは出ない", () => {
    render(<AccountView {...props} />);
    const row = within(screen.getByText("Google").closest("li") as HTMLElement);
    expect(row.getByText("未連結")).toBeTruthy();
    expect(row.getByText("未連結").className).toContain("bg-neutral"); // 未連結は、緑にしない
    expect(row.getByRole("button", { name: "Google を連結する" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "連結を解除する" })).toBeNull();
  });

  it("Google が連結済み: 名前の横に「連結済み」のラベル、右端に解除するボタン。連結するボタンは出ない", () => {
    render(<AccountView {...props} googleAccountId="acc-1" />);
    const row = within(screen.getByText("Google").closest("li") as HTMLElement);
    expect(row.getByText("連結済み")).toBeTruthy();
    expect(row.getByText("連結済み").className).toContain("bg-status-on "); // 緑の札(このアプリの色の名前。存在しない名前だと、色が付かない)
    expect(row.getByText("連結済み").className).toContain("text-status-on-ink");
    // 状態のラベルは、ボタンとは別の形・別の場所(混同を避ける): 小さな丸いラベルで、名前と同じ枠の中。ボタンは、ラベルの中にも、隣にも無い
    expect(row.getByText("連結済み").className).toContain("rounded-full");
    expect(row.getByText("連結済み").closest("button")).toBeNull();
    expect(row.getByText("Google").parentElement).toBe(row.getByText("連結済み").parentElement);
    expect(row.getByRole("button", { name: "連結を解除する" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Google を連結する" })).toBeNull();
  });

  it("Google の使い道の文は、つながった 1 文として読める。言葉のまとまりごとに、途中で切れない(狭い幅での、不自然な折り返しを防ぐ)", () => {
    const { rerender } = render(<AccountView {...props} />);
    const sentence = () => (screen.getByText("Google でログインできます。").parentElement as HTMLElement);
    expect(sentence().textContent).toBe("連結すると、メールを待たずに、Google でログインできます。");
    expect(sentence().querySelectorAll("span.whitespace-nowrap")).toHaveLength(3);
    rerender(<AccountView {...props} googleAccountId="acc-1" />);
    expect(sentence().textContent).toBe("メールを待たずに、Google でログインできます。"); // 状態は札に出ているので、文は使い道だけ
  });

  it("Google の設定が無いときは、Google の行も、説明も出さない", () => {
    render(<AccountView {...props} googleEnabled={false} />);
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.queryByText("Google の連結について")).toBeNull();
    expect(screen.getByText("使えます")).toBeTruthy(); // メールのリンクは、そのまま
  });

  it("Google の細かい説明は、折りたたんである(開くまで、閉じている)", () => {
    const { container } = render(<AccountView {...props} />);
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    expect(within(details as HTMLElement).getByText("Google の連結について")).toBeTruthy();
    expect(details?.textContent).toContain("5 分以内");
    expect(details?.textContent).toContain("Google だけでは、新しくアカウントを作れません");
  });

  it("ログアウトは、設定とは別に、区切り線の下に独立して置く", () => {
    render(<AccountView {...props} />);
    const logout = screen.getByRole("button", { name: "ログアウト" });
    expect(logout.closest("div.border-t")?.textContent).toContain("この端末からログアウトします。");
  });

  it("連結に失敗して戻されたときは、理由を赤で出す(失敗は重要な知らせ)。無ければ出さない", () => {
    const { rerender } = render(<AccountView {...props} failure="この Google アカウントは、すでに別のアカウントに連結されています。" />);
    expect(screen.getByRole("alert").className).toContain("text-red-600");
    rerender(<AccountView {...props} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
