// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkGoogleButton } from "./link-google-button";
import { UnlinkGoogleButton } from "./unlink-google-button";

const client = vi.hoisted(() => ({ linkSocial: vi.fn(), unlinkAccount: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: client }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const onError = vi.fn();

beforeEach(() => {
  onError.mockReset();
  client.linkSocial.mockReset();
  client.unlinkAccount.mockReset();
  router.refresh.mockReset();
});
afterEach(cleanup);

describe("LinkGoogleButton", () => {
  it("押すと、前の失敗の文を、まず消す(onError(null))", async () => {
    client.linkSocial.mockResolvedValue({ error: null });
    render(<LinkGoogleButton onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await screen.findByRole("button", { name: "Google へ移動中..." });
    expect(onError).toHaveBeenCalledWith(null);
  });

  it("押すと、Google の連結を始める。戻り先は、アカウントのページ(成功も、失敗も)", async () => {
    client.linkSocial.mockResolvedValue({ error: null });
    render(<LinkGoogleButton onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await screen.findByRole("button", { name: "Google へ移動中..." });
    expect(client.linkSocial).toHaveBeenCalledWith({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account" });
  });

  it("新しいログインを求められたときは、直し方を伝える。ボタンは、また押せる", async () => {
    client.linkSocial.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH", status: 403 } });
    render(<LinkGoogleButton onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("メールのリンクでもう一度ログイン")));
    expect(screen.queryByRole("alert")).toBeNull(); // 失敗の文は、ボタンの下には出さない(行の下に、全幅で出す。google-link-controls.tsx)
    expect((screen.getByRole("button", { name: "Google を連結する" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("通信が失敗しても、ボタンが押せないままにならない", async () => {
    client.linkSocial.mockRejectedValue(new Error("network"));
    render(<LinkGoogleButton onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("通信に失敗しました")));
    expect((screen.getByRole("button", { name: "Google を連結する" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ブラウザの戻るで、Google から戻ったとき(キャッシュからの復元)、「移動中」のままにならない", async () => {
    client.linkSocial.mockResolvedValue({ error: null });
    render(<LinkGoogleButton onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Google を連結する" }));
    await screen.findByRole("button", { name: "Google へ移動中..." });
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(screen.getByRole("button", { name: "Google を連結する" })).toBeTruthy();
  });
});

describe("UnlinkGoogleButton", () => {
  it("確認してから、連結の id で解除し、ページを読み直す(プロバイダー名ではなく id)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    client.unlinkAccount.mockResolvedValue({ error: null });
    render(<UnlinkGoogleButton accountId="acc-1" onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "連結を解除する" }));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(client.unlinkAccount).toHaveBeenCalledWith({ accountId: "acc-1" });
  });

  it("確認で「いいえ」なら、何もしない", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<UnlinkGoogleButton accountId="acc-1" onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "連結を解除する" }));
    expect(client.unlinkAccount).not.toHaveBeenCalled();
  });

  it("新しいログインを求められたときは、直し方を伝える(解除の文言)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    client.unlinkAccount.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH", status: 403 } });
    render(<UnlinkGoogleButton accountId="acc-1" onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "連結を解除する" }));
    await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("解除")));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
