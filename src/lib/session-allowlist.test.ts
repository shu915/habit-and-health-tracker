import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionAllowlistHooks } from "./session-allowlist";

afterEach(() => vi.unstubAllEnvs());

const before = sessionAllowlistHooks.create.before;
const contextWith = (user: { email: string } | null) => ({ context: { internalAdapter: { findUserById: async () => user } } });

describe("sessionAllowlistHooks(セッションを作るとき、許可リストの中の人にだけ作る)", () => {
  it("アカウントのメールが許可リストの中なら、作る(大文字小文字は区別しない)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com, other@example.com");
    expect(await before({ userId: "u1" }, contextWith({ email: "Friend@Example.com" }))).toBe(true);
  });

  it("許可リストの外なら、作らない", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    expect(await before({ userId: "u1" }, contextWith({ email: "removed@example.com" }))).toBe(false);
  });

  it("ユーザーが見つからない・文脈が無いときは、安全側(作らない)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    expect(await before({ userId: "u1" }, contextWith(null))).toBe(false);
    expect(await before({ userId: "u1" }, null)).toBe(false);
  });

  it("許可リストが空のとき: 開発・テストは全員許可、本番は誰も許可しない(既存の意味のまま)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await before({ userId: "u1" }, contextWith({ email: "anyone@example.com" }))).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(await before({ userId: "u1" }, contextWith({ email: "anyone@example.com" }))).toBe(false);
  });
});
