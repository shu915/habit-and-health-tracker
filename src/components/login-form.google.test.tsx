// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const client = vi.hoisted(() => ({ signIn: { social: vi.fn(), magicLink: vi.fn() } }));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));

beforeEach(() => {
  client.signIn.social.mockReset();
  client.signIn.magicLink.mockReset();
});
afterEach(cleanup);

describe("LoginForm の Google", () => {
  it("Google の設定が無ければ、ボタンを出さない(これまでどおり、メールだけ)", () => {
    render(<LoginForm />);
    expect(screen.queryByRole("button", { name: "Google でログイン" })).toBeNull();
    expect(screen.getByRole("button", { name: "ログインリンクを送る" })).toBeTruthy();
  });

  it("設定があれば、ボタンを出し、押すと Google のログインを始める。失敗したときの戻り先は、ログイン画面", () => {
    client.signIn.social.mockResolvedValue({ error: null });
    render(<LoginForm googleEnabled />);
    expect(screen.getByText(/連結した Google だけが使えます/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));
    expect(client.signIn.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" });
  });

  it("Google でログインできずに戻されたときは、その理由を、フォームの上に出す", () => {
    render(<LoginForm googleEnabled notice="この Google アカウントは、まだ連結されていません。" />);
    expect(screen.getByRole("status").textContent).toContain("まだ連結されていません");
  });

  it("Google があるときだけ、メールと Google のあいだに「または」を出す(1 枚のカードの中に、縦に並ぶ)", () => {
    const { container, rerender } = render(<LoginForm />);
    expect(screen.queryByText("または")).toBeNull();
    rerender(<LoginForm googleEnabled />);
    expect(screen.getByText("または")).toBeTruthy();
    // メールのフォームと、Google のボタンは、同じカードの中にある(カードは 1 枚)
    const card = screen.getByRole("button", { name: "Google でログイン" }).closest("div.bg-surface-raised");
    expect(card).not.toBeNull();
    expect(card).toBe(screen.getByRole("button", { name: "ログインリンクを送る" }).closest("div.bg-surface-raised"));
    expect(container.querySelectorAll("div.bg-surface-raised")).toHaveLength(1);
  });

  it("通信が失敗しても、Google のボタンが押せないままにならない", async () => {
    client.signIn.social.mockRejectedValue(new Error("network"));
    render(<LoginForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Google でログイン" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
