import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailAllowed } from "./allowlist";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isEmailAllowed", () => {
  it("リストにあるアドレスだけを許可する", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", "a@example.com,b@example.com");
    expect(isEmailAllowed("a@example.com")).toBe(true);
    expect(isEmailAllowed("b@example.com")).toBe(true);
    expect(isEmailAllowed("c@example.com")).toBe(false);
  });

  it("大文字小文字と前後の空白を無視する", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", " Alice@Example.com , bob@example.com ");
    expect(isEmailAllowed("alice@example.com")).toBe(true);
    expect(isEmailAllowed("  BOB@example.com ")).toBe(true);
  });

  it("部分一致や、別ドメインの同名は許可しない", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", "a@example.com");
    expect(isEmailAllowed("a@example.com.evil.test")).toBe(false);
    expect(isEmailAllowed("xa@example.com")).toBe(false);
    expect(isEmailAllowed("a@example.org")).toBe(false);
  });

  it("本番でリストが空なら誰も許可しない", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", "");
    expect(isEmailAllowed("a@example.com")).toBe(false);
  });

  it("本番でリストが未設定でも誰も許可しない", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", undefined);
    expect(isEmailAllowed("a@example.com")).toBe(false);
  });

  it("開発でリストが空なら全員許可する", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOWED_EMAILS", "");
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
  });

  it("開発でもリストがあれば、リストの外は許可しない", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOWED_EMAILS", "a@example.com");
    expect(isEmailAllowed("b@example.com")).toBe(false);
  });
});
