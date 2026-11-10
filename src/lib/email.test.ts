import { afterEach, describe, expect, it, vi } from "vitest";
import { describeEmailError, EmailConfigError, EmailSendError, resolveTransport, sendEmail } from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const email = { to: "friend@example.com", subject: "ログインリンク", text: "ログイン: https://app.example/magic?token=SECRET", html: "<p>hi</p>" };

describe("resolveTransport", () => {
  it("開発とテストは、コンソール(キーがあっても、既定では Resend を使わない)", () => {
    expect(resolveTransport({ NODE_ENV: "development" })).toEqual({ kind: "console" });
    expect(resolveTransport({ NODE_ENV: "test", RESEND_API_KEY: "re_x", MAIL_FROM: "a@example.com" })).toEqual({ kind: "console" });
  });

  it("本番は Resend。キーと送信元を、前後の空白を除いて読む。返信先は任意(空なら null)", () => {
    expect(resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: " re_x ", MAIL_FROM: " App <login@example.com> " })).toEqual({ kind: "resend", apiKey: "re_x", from: "App <login@example.com>", replyTo: null });
    expect(resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: "re_x", MAIL_FROM: "a@example.com", MAIL_REPLY_TO: "admin@example.com" })).toMatchObject({ replyTo: "admin@example.com" });
    expect(resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: "re_x", MAIL_FROM: "a@example.com", MAIL_REPLY_TO: "  " })).toMatchObject({ replyTo: null });
  });

  it("本番で、キーか送信元が無ければ、黙ってコンソールに出さず、エラーにする", () => {
    expect(() => resolveTransport({ NODE_ENV: "production" })).toThrow("メール送信の設定が足りません");
    expect(() => resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: "re_x" })).toThrow("メール送信の設定が足りません");
    expect(() => resolveTransport({ NODE_ENV: "production", MAIL_FROM: "a@example.com" })).toThrow("メール送信の設定が足りません");
    expect(() => resolveTransport({ NODE_ENV: "production", RESEND_API_KEY: "  ", MAIL_FROM: "a@example.com" })).toThrow("メール送信の設定が足りません");
  });

  it("EMAIL_TRANSPORT=resend なら、開発でも Resend(本物のメールが届くかの確認用)。キーが無ければ、エラー", () => {
    expect(resolveTransport({ NODE_ENV: "development", EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x", MAIL_FROM: "a@example.com" })).toMatchObject({ kind: "resend" });
    expect(() => resolveTransport({ NODE_ENV: "development", EMAIL_TRANSPORT: "resend" })).toThrow();
  });
});

describe("sendEmail", () => {
  it("開発は、コンソールに出すだけで、外へは送らない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail(email);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("token=SECRET"));
  });

  describe("本番(Resend)", () => {
    const production = () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      vi.stubEnv("MAIL_FROM", "Habit and Health Tracker <login@example.com>");
      vi.stubEnv("MAIL_REPLY_TO", "");
    };
    const respond = (status: number, body: unknown) => {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };
    const sentBody = (fetchMock: ReturnType<typeof respond>) => JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;

    it("Resend の API に、キーつきで、送信元・宛先(配列)・件名・本文を POST する", async () => {
      production();
      const fetchMock = respond(200, { id: "abc" });
      await sendEmail(email);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
      expect(init?.signal).toBeInstanceOf(AbortSignal); // 待ち続けない
      expect(sentBody(fetchMock)).toEqual({ from: "Habit and Health Tracker <login@example.com>", to: ["friend@example.com"], subject: "ログインリンク", text: email.text, html: "<p>hi</p>" });
    });

    it("返信先があれば reply_to を付ける。HTML が無ければ html を付けない", async () => {
      production();
      vi.stubEnv("MAIL_REPLY_TO", "admin@example.com");
      const fetchMock = respond(200, { id: "abc" });
      await sendEmail({ to: email.to, subject: email.subject, text: email.text });
      expect(sentBody(fetchMock)).toMatchObject({ reply_to: "admin@example.com" });
      expect(sentBody(fetchMock)).not.toHaveProperty("html");
    });

    it("本番では、宛先・件名・本文(ログインリンク)を、ログに出さない", async () => {
      production();
      respond(200, { id: "abc" });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      await sendEmail(email);
      expect(log).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
    });

    it("Resend が断ったら、状態と種類だけをエラーにする。宛先・本文・Resend のメッセージ(宛先を含みうる)は入れない", async () => {
      production();
      respond(422, { name: "validation_error", message: "Invalid `to` field: friend@example.com", statusCode: 422 });
      const error = await sendEmail(email).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EmailSendError);
      const message = (error as Error).message;
      expect(message).toContain("422");
      expect(message).toContain("validation_error");
      expect(message).not.toContain("friend@example.com");
      expect(message).not.toContain("SECRET");
      expect(message).not.toContain("re_test_key");
    });

    it("返事が JSON でなくても、状態つきのエラーになる", async () => {
      production();
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
      await expect(sendEmail(email)).rejects.toThrow("502");
    });

    it("通信そのものが失敗したら、そのままエラーにする(呼ぶ側が、ログに残して、応答は変えない)", async () => {
      production();
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
      await expect(sendEmail(email)).rejects.toThrow("fetch failed");
    });

    it("設定が足りない本番は、外へ送らずに、エラーにする", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("RESEND_API_KEY", "");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(sendEmail(email)).rejects.toThrow("メール送信の設定が足りません");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("describeEmailError: ログに出すための、失敗の説明", () => {
  it("自分たちのエラー(設定が足りない・Resend が断った)は、message を出す", () => {
    expect(describeEmailError(new EmailConfigError("メール送信の設定が足りません"))).toBe("メール送信の設定が足りません");
    expect(describeEmailError(new EmailSendError("Resend がメールを受け付けませんでした(状態 422)"))).toContain("422");
  });

  it("外から来るエラーは、名前だけ。message や cause に、キーや宛先が入っていても、出さない", () => {
    const external = new TypeError('Invalid character in header content ["Authorization"]: Bearer re_SECRET_KEY', { cause: { hostname: "api.resend.com", to: "friend@example.com" } });
    const described = describeEmailError(external);
    expect(described).toBe("TypeError");
    expect(described).not.toContain("re_SECRET_KEY");
    expect(describeEmailError("文字列が投げられた")).toBe("unknown");
  });
});
