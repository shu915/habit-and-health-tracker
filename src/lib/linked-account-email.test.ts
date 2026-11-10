import { describe, expect, it } from "vitest";
import { linkedAccountEmail } from "./linked-account-email";

describe("linkedAccountEmail", () => {
  // UTC の 2026-11-10 06:30 = 日本時間の 15:30
  const at = new Date("2026-11-10T06:30:00Z");

  it("連結されたことと、日本時間の日時を書く。覚えがなければ、メールのリンクでログインして、アカウントのページから解除する、と案内する", () => {
    const { subject, text } = linkedAccountEmail("google", at);
    expect(subject).toContain("ログイン方法が追加されました");
    expect(text).toContain("Google のアカウントが、あなたのアカウントに連結されました");
    expect(text).toContain("15:30");
    expect(text).toContain("身に覚えがないとき");
    expect(text).toContain("アカウントのページ");
  });

  it("知らないプロバイダーは、一般の言い方にする(相手から来た文字列を、本文に入れない)", () => {
    const { text } = linkedAccountEmail("<script>evil", at);
    expect(text).toContain("新しいログイン方法が、あなたのアカウントに連結されました");
    expect(text).not.toContain("evil");
  });
});
