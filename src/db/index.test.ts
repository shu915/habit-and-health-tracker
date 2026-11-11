import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

// 待機中の接続が、サーバー側から切られても、プロセスを落とさない(Pool の error イベントのリスナーがある)
describe("db の Pool", () => {
  it("error のリスナーと、接続の待ち時間の上限がある", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/unused");
    await import("./index"); // Pool を作るだけ(つなぎには行かない)
    const pool = (globalThis as typeof globalThis & { __pgPool?: Pool }).__pgPool;
    expect(pool).toBeDefined();
    expect(pool?.listenerCount("error")).toBeGreaterThan(0);
    expect(pool?.options.connectionTimeoutMillis).toBeGreaterThan(0);
    vi.unstubAllEnvs();
  });

  it("error イベントが出ても、例外にならず、記録だけする(接続文字列は出さない)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/unused");
    await import("./index");
    const pool = (globalThis as typeof globalThis & { __pgPool?: Pool }).__pgPool;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => pool?.emit("error", new Error("postgres://user:pass@host/db が切れた"))).not.toThrow();
    expect(logged).toHaveBeenCalledWith("[db] idle client error:", "Error");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("pass");
    logged.mockRestore();
    vi.unstubAllEnvs();
  });
});
