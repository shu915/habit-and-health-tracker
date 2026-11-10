// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserEmail } from "./user-email";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/current-user", () => session);
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

describe("UserEmail(ヘッダーのメールアドレスと、そのメニュー)", () => {
  it("ログインしていなければ、何も出さない", async () => {
    session.getSession.mockResolvedValue(null);
    const { container } = render(await UserEmail());
    expect(container.textContent).toBe("");
  });

  it("メールアドレスは、アカウントのページへのリンク。広い画面では、アドレスにマウスを乗せると、メニュー(アカウント・ログアウト)が出る", async () => {
    session.getSession.mockResolvedValue({ user: { email: "friend@example.com" } });
    const { container } = render(await UserEmail());

    const trigger = screen.getByTitle("friend@example.com");
    expect(trigger.getAttribute("href")).toBe("/account");
    expect(trigger.textContent).toContain("friend@example.com");

    const menu = within(screen.getByRole("group", { name: "アカウントのメニュー" }));
    expect(menu.getByRole("link", { name: "アカウント" }).getAttribute("href")).toBe("/account");
    expect(menu.getByRole("button", { name: "ログアウト" })).toBeTruthy();

    // 乗せる・合わせるまでは隠れ、狭い画面(スマホ)では、メニューは出ない(ログアウトは、ヘッダーに別に出る)
    const panel = container.querySelector(".absolute");
    expect(panel?.className).toContain("hidden");
    expect(panel?.className).toContain("sm:group-hover:block");
    expect(panel?.className).toContain("sm:group-focus-within:block");
    expect(container.firstElementChild?.className).toContain("group"); // 乗せる対象は、アドレスとメニューを包む枠(間でマウスが外れても消えない)
  });

  it("狭い画面では、アドレスの代わりに「アカウント」の文字を出す", async () => {
    session.getSession.mockResolvedValue({ user: { email: "friend@example.com" } });
    render(await UserEmail());
    expect(screen.getByTitle("friend@example.com").textContent).toContain("アカウント");
  });
});
