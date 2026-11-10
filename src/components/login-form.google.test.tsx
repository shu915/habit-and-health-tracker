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

  it("通信が失敗しても、Google のボタンが押せないままにならない", async () => {
    client.signIn.social.mockRejectedValue(new Error("network"));
    render(<LoginForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Google でログイン" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
