import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn })); // リクエストごとの記憶は、ここでは使わない(テストごとに、新しく読む)
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const session = (email: string) => ({ user: { id: `user-of-${email}`, email }, session: { id: "s1" } });

beforeEach(() => {
  vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getSession: 許可リストの外の人のセッションは、あっても無いものとして扱う", () => {
  it("許可リストの中の人のセッションは、そのまま返す(大文字小文字は区別しない)", async () => {
    const { getSession: read } = await import("./current-user");
    getSession.mockResolvedValue(session("Friend@Example.com"));
    expect(await read()).toEqual(session("Friend@Example.com"));
  });

  it("許可リストから外した人は、session の行が残っていても、null(締め出すのに、session の行を消す手順に頼らない)", async () => {
    const { getSession: read } = await import("./current-user");
    getSession.mockResolvedValue(session("removed@example.com"));
    expect(await read()).toBeNull();
  });

  it("未ログイン(セッションが無い)は、null のまま", async () => {
    const { getSession: read } = await import("./current-user");
    getSession.mockResolvedValue(null);
    expect(await read()).toBeNull();
  });

  it("本番で許可リストが空なら、誰も入れない(設定の誤りは、全員が入れない側に倒れる)", async () => {
    const { getSession: read } = await import("./current-user");
    vi.stubEnv("ALLOWED_EMAILS", "");
    vi.stubEnv("NODE_ENV", "production");
    getSession.mockResolvedValue(session("friend@example.com"));
    expect(await read()).toBeNull();
  });
});

describe("getCurrentUserId: 許可リストの外の人は、/login へ送る", () => {
  it("許可リストの中の人の id を返す", async () => {
    const { getCurrentUserId } = await import("./current-user");
    getSession.mockResolvedValue(session("friend@example.com"));
    expect(await getCurrentUserId()).toBe("user-of-friend@example.com");
  });

  it("外した人は、データを読む関数の入口(getCurrentUserId)で、/login へ送られる", async () => {
    const { getCurrentUserId } = await import("./current-user");
    getSession.mockResolvedValue(session("removed@example.com"));
    await expect(getCurrentUserId()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
