// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./sign-out-button";

const client = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  client.signOut.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
});
afterEach(cleanup);

describe("SignOutButton", () => {
  it.each(["menu", "page"] as const)("%s の見た目でも、押すとログアウトして、ログイン画面へ移る", async (variant) => {
    client.signOut.mockResolvedValue({ error: null });
    render(<SignOutButton variant={variant} />);
    fireEvent.click(screen.getByRole(variant === "menu" ? "menuitem" : "button", { name: "ログアウト" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("失敗したら、ログイン画面へは移らず、失敗を知らせる(赤。失敗は、重要な知らせ)。通信が失敗したときも同じ", async () => {
    client.signOut.mockResolvedValue({ error: { status: 500 } });
    const { unmount } = render(<SignOutButton variant="menu" />);
    fireEvent.click(screen.getByRole("menuitem", { name: "ログアウト" }));
    const alert = await screen.findByRole("alert"); // 読み上げにも、すぐ伝わる
    expect(alert.textContent).toBe("ログアウトに失敗しました");
    expect(alert.className).toContain("text-red-600");
    expect(router.push).not.toHaveBeenCalled();
    unmount();

    client.signOut.mockRejectedValue(new Error("network"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByText("ログアウトに失敗しました")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
