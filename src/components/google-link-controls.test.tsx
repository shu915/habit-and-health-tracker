// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLinkControls } from "./google-link-controls";

const client = vi.hoisted(() => ({ linkSocial: vi.fn(), unlinkAccount: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  client.linkSocial.mockReset();
  client.unlinkAccount.mockReset();
});
afterEach(cleanup);

describe("GoogleLinkControls(Google の行の右側と、失敗の文)", () => {
  it("操作のボタンは 1 つだけ(状態のラベルは、ここには無い。名前の横にある)。連結済みなら解除、未連結なら連結のボタン", () => {
    const { container, rerender } = render(<GoogleLinkControls accountId="acc-1" />);
    const group = container.firstElementChild as HTMLElement;
    expect(group.querySelectorAll("button")).toHaveLength(1);
    expect(group.textContent).toBe("連結を解除する");
    rerender(<GoogleLinkControls accountId={null} />);
    expect((container.firstElementChild as HTMLElement).querySelector("button")?.textContent).toBe("Google を連結する");
  });

  it("失敗の文は、ボタンの外(行の下)に、全幅で出る。右側の幅を、押し広げない(行全体が、縦に並んでいた)", async () => {
    client.unlinkAccount.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH", status: 403 } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<GoogleLinkControls accountId="acc-1" />);
    fireEvent.click(screen.getByRole("button", { name: "連結を解除する" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("メールのリンクでもう一度ログイン");
    expect(alert.className).toContain("col-span-full"); // グリッドの全幅
    expect(alert.className).toContain("text-red-600"); // 失敗は重要な知らせなので赤
    const group = container.firstElementChild as HTMLElement;
    expect(group.contains(alert)).toBe(false); // ボタンの枠の中には、入れない
  });

  it("もう一度押すと、前の失敗の文は消える", async () => {
    client.linkSocial.mockResolvedValueOnce({ error: { code: "SESSION_NOT_FRESH", status: 403 } }).mockResolvedValueOnce({ error: null });
    render(<GoogleLinkControls accountId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
