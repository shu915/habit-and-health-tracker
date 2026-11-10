import { describe, expect, it } from "vitest";
import { loginEmail, MAGIC_LINK_EXPIRES_IN_SECONDS } from "./login-email";

const url = "https://app.example.com/api/auth/magic-link/verify?token=abc123&callbackURL=%2F";

describe("loginEmail", () => {
  it("件名にアプリの名前、本文にリンク(そのまま)と、有効期限・1 回だけ・覚えがなければ無視・人に送らない、を書く", () => {
    const { subject, text } = loginEmail(url);
    expect(subject).toContain("Habit and Health Tracker");
    expect(text).toContain(url);
    expect(text).toContain(`${MAGIC_LINK_EXPIRES_IN_SECONDS / 60} 分間、1 回だけ`);
    expect(text).toContain("覚えがないとき");
    expect(text).toContain("ほかの人に送らない");
  });

  it("HTML は、ボタンとリンクの両方を持つ。リンクの & は、HTML の記号として正しく書く(href に生の & を入れない)", () => {
    const { html } = loginEmail(url);
    expect(html).toContain('href="https://app.example.com/api/auth/magic-link/verify?token=abc123&amp;callbackURL=%2F"');
    expect(html).toContain("ログインする");
    expect(html).not.toContain("token=abc123&callbackURL"); // 生の & は、どこにも無い
    expect(html.match(/token=abc123&amp;callbackURL/g)).toHaveLength(2); // ボタンと、貼り付け用の文字
  });

  it("リンクに、HTML を壊す文字が入っていても、エスケープする(想定外の入力で、メールが壊れたり、タグが入ったりしない)", () => {
    const { html } = loginEmail('https://example.com/?a="><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("有効期限は、Better Auth の設定(auth.ts の expiresIn)と同じ定数 5 分", () => {
    expect(MAGIC_LINK_EXPIRES_IN_SECONDS).toBe(300);
  });
});
