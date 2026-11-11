// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserEmail } from "./user-email";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/current-user", () => session);
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

describe("UserEmail(ヘッダーのアカウントのメニューへ、ログイン中のアドレスを渡す)", () => {
  it("ログインしていなければ、何も出さない", async () => {
    session.getSession.mockResolvedValue(null);
    const { container } = render(await UserEmail());
    expect(container.textContent).toBe("");
  });

  it("ログイン中のメールアドレスを、メニューのボタンに出す", async () => {
    session.getSession.mockResolvedValue({ user: { email: "friend@example.com" } });
    render(await UserEmail());
    expect(screen.getByRole("button", { name: /friend@example\.com/ }).getAttribute("aria-haspopup")).toBe("menu");
  });
});
