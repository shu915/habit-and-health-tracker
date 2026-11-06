import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Next.js は matcher を正規表現として扱う。先頭の "/" 以降のグループをそのまま使って、パスごとに照合する
function matches(path: string): boolean {
  const [source] = config.matcher;
  return new RegExp(`^${source}$`).test(path);
}

describe("proxy matcher", () => {
  it("ログイン後のページは対象にする", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/profile/edit")).toBe(true);
    expect(matches("/days/2026-10-21")).toBe(true);
  });

  it("認証 API・ログインページ・静的ファイルは対象にしない", () => {
    expect(matches("/api/auth/sign-in/magic-link")).toBe(false);
    expect(matches("/login")).toBe(false);
    expect(matches("/_next/static/chunks/app.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });

  it("アイコンと manifest は対象にしない(ログイン前でも、タブのアイコンやホーム画面への追加で読まれる)", () => {
    for (const path of ["/icon.png", "/apple-icon.png", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/logo.webp"]) {
      expect(matches(path)).toBe(false);
    }
  });

  it("名前が似ているだけのパスは対象にする(前方一致で外れない)", () => {
    expect(matches("/apiary")).toBe(true);
    expect(matches("/login-history")).toBe(true);
    expect(matches("/apikeys")).toBe(true);
    expect(matches("/favicon.icon")).toBe(true);
    expect(matches("/icon.png.html")).toBe(true);
    expect(matches("/icons")).toBe(true);
  });
});
