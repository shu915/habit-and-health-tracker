// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./user-menu";

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const EMAIL = "friend@example.com";
const trigger = () => screen.getByRole("button", { name: new RegExp(EMAIL) });

beforeEach(() => {
  render(<UserMenu email={EMAIL} />);
});
afterEach(cleanup);

describe("UserMenu(ヘッダーのアカウントのメニュー。押して開く)", () => {
  it("最初は閉じている。ボタンは、メールアドレス(スマホ幅では「アカウント」の文字)を持ち、開いていないことを伝える", () => {
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().textContent).toContain(EMAIL);
    expect(trigger().textContent).toContain("アカウント");
  });

  it("押すと開く。メニューの上に、ログイン中のメールアドレス(スマホ幅でも見える)、項目は、アカウントの設定とログアウト", () => {
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("ログイン中")).toBeTruthy();
    expect(screen.getAllByText(EMAIL).length).toBeGreaterThanOrEqual(2); // ボタンと、メニューの中
    const menu = within(screen.getByRole("menu", { name: "アカウントのメニュー" }));
    expect(menu.getByRole("menuitem", { name: "アカウントの設定" }).getAttribute("href")).toBe("/account");
    expect(menu.getByRole("menuitem", { name: "ログアウト" })).toBeTruthy();
    expect(trigger().getAttribute("aria-controls")).toBe(screen.getByRole("menu").id); // ボタンが指すのは、メニュー(role=menu)そのもの
  });

  it("もう一度押すと閉じる", () => {
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("メニューの外を押すと閉じる。メニューの中を押しても、閉じない(項目を押せるように)", () => {
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByText("ログイン中"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Esc で閉じて、フォーカスをボタンへ戻す", () => {
    fireEvent.click(trigger());
    screen.getByRole("menuitem", { name: "アカウントの設定" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("閉じているあいだは、外を押しても、Esc を押しても、何も起きない(余計な見張りをしない)", () => {
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("アカウントの設定を押すと、移動のために、メニューを閉じる", () => {
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "アカウントの設定" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("キーボード: ボタンで ↓ を押すと、開いて、先頭の項目へ。↑ ↓ で項目を移り(端で一周)、Home・End で先頭・末尾へ", () => {
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    const account = screen.getByRole("menuitem", { name: "アカウントの設定" });
    const logout = screen.getByRole("menuitem", { name: "ログアウト" });
    expect(document.activeElement).toBe(account);

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(logout);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(account); // 末尾から、先頭へ一周
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(logout);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Home" });
    expect(document.activeElement).toBe(account);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(document.activeElement).toBe(logout);
  });

  it("開いたまま、ボタンで ↓ を押すと、先頭の項目へ", () => {
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "アカウントの設定" }));
  });

  it("キーボード: ボタンで ↑ を押すと、開いて、末尾の項目へ", () => {
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "ログアウト" }));
  });

  it("Tab で、メニューの外へフォーカスが出たら、閉じる。メニューの中でフォーカスが移るだけなら、閉じない", () => {
    fireEvent.click(trigger());
    const account = screen.getByRole("menuitem", { name: "アカウントの設定" });
    const logout = screen.getByRole("menuitem", { name: "ログアウト" });
    account.focus();
    fireEvent.blur(account, { relatedTarget: logout }); // メニューの中での移動
    expect(screen.getByRole("menu")).toBeTruthy();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireEvent.blur(logout, { relatedTarget: outside }); // 外へ出た
    expect(screen.queryByRole("menu")).toBeNull();
    outside.remove();
  });

  it("移り先が無いとき(メニューの文字を押したときなど)は、閉じない", () => {
    fireEvent.click(trigger());
    fireEvent.blur(trigger(), { relatedTarget: null });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("印刷には出ない", () => {
    expect(trigger().parentElement?.className).toContain("print:hidden");
  });
});
