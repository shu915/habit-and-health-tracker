import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { FRESH_SESSION_SECONDS, googleAuthOptions, googleCredentialsFromEnv, guardAccountEndpoints, type LinkedNotice } from "@/lib/google-auth-options";
import { sessionAllowlistHooks } from "@/lib/session-allowlist";

// 本物の Better Auth(メモリ上の DB、本物のマジックリンクと OAuth のコールバックの処理)を動かし、Google のトークンを返す通信だけを偽物にする。
// 「マジックリンクがユーザーを作る。Google は、ログイン中のユーザーだけが足せて、Google だけではユーザーを作れない」という方針を、固定する。
// 許可リストを迂回されないことの、いちばん大事なテスト。

const BASE = "http://localhost:3000";

type GoogleIdentity = { sub: string; email: string };
let google: GoogleIdentity = { sub: "unset", email: "unset@example.com" };

const realFetch = globalThis.fetch;

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

// Better Auth は、返ってきた id_token から Google のユーザーを読む(ここでは署名を確かめない)
function fakeIdToken({ sub, email }: GoogleIdentity): string {
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ sub, email, email_verified: true, name: "Google User" })}.sig`;
}

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "access-token", token_type: "Bearer", expires_in: 3600, id_token: fakeIdToken(google) });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 時計を、「新しいログイン」の時間より先に進める(これまでのセッションが、すべて古くなる)
function makeSessionsStale() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.now() + (FRESH_SESSION_SECONDS + 60) * 1000));
}

const cookiesOf = (res: Response): string =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const mergeCookies = (...parts: string[]): string => parts.filter(Boolean).join("; ");

function createTestAuth(notify: (notice: LinkedNotice) => Promise<void> = async () => {}) {
  const notifyLinked = vi.fn(notify);
  const options = googleAuthOptions({ clientId: "client-id", clientSecret: "client-secret" }, { notifyLinked });
  const tokens = new Map<string, string>();
  const auth = betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-123456",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, token }) => {
          tokens.set(email, token);
        },
      }),
    ],
    ...options,
    // auth.ts と同じ守り: セッションを作るのは、許可リストの中の人だけ(どの経路でも)
    databaseHooks: { ...options.databaseHooks, session: sessionAllowlistHooks },
    // auth.ts と同じ守り(連結まわりのエンドポイント)
    hooks: { before: createAuthMiddleware(async (ctx) => guardAccountEndpoints(ctx)) },
  });

  // メールのリンクでログインする(ユーザーは、ここで作られる)。セッションの Cookie を返す
  async function signInWithMagicLink(email: string): Promise<string> {
    await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
    const token = tokens.get(email);
    if (!token) throw new Error("マジックリンクのトークンが送られていない");
    return cookiesOf(await auth.api.magicLinkVerify({ query: { token }, headers: new Headers(), asResponse: true }));
  }

  // Google の流れを始めて、Google が戻ってくる(コールバック)ところまで演じる。連結はセッションが要り、ログインは要らない
  async function googleCallback(identity: GoogleIdentity, mode: "signIn" | "link", sessionCookie = "") {
    google = identity;
    const start =
      mode === "link"
        ? await auth.api.linkSocialAccount({ body: { provider: "google", callbackURL: "/account", errorCallbackURL: "/account" }, headers: new Headers({ cookie: sessionCookie }), asResponse: true })
        : await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/", errorCallbackURL: "/login" }, headers: new Headers(), asResponse: true });
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    if (!state) throw new Error("Google へのリダイレクトに state が無い");
    const res = await auth.handler(new Request(`${BASE}/api/auth/callback/google?code=code&state=${state}`, { headers: { cookie: mergeCookies(sessionCookie, cookiesOf(start)) } }));
    const location = new URL(res.headers.get("location") ?? "", BASE);
    return { path: location.pathname, error: location.searchParams.get("error"), cookie: cookiesOf(res) };
  }

  async function userByEmail(email: string) {
    return (await auth.$context).internalAdapter.findUserByEmail(email);
  }

  async function accountsOf(cookie: string) {
    return auth.api.listUserAccounts({ headers: new Headers({ cookie }) });
  }

  const linkedProviders = async (cookie: string): Promise<string[]> => (await accountsOf(cookie)).map((account) => account.providerId);

  async function sessionUserId(cookie: string): Promise<string | undefined> {
    return (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id;
  }

  async function googleAccountId(cookie: string): Promise<string> {
    const account = (await accountsOf(cookie)).find((a) => a.providerId === "google");
    if (!account) throw new Error("Google が連結されていない");
    return account.id;
  }

  return { auth, notifyLinked, signInWithMagicLink, googleCallback, userByEmail, linkedProviders, sessionUserId, googleAccountId, accountsOf };
}

describe("Google のログインの方針", () => {
  it("だれも連結していない Google アカウントでは、ユーザーを作らない(許可リストを迂回させない)", async () => {
    const t = createTestAuth();
    const result = await t.googleCallback({ sub: "g-new", email: "new@example.com" }, "signIn");
    expect(result.path).toBe("/login");
    expect(result.error).toBe("signup_disabled");
    expect(result.cookie).not.toContain("session_token");
    expect(await t.userByEmail("new@example.com")).toBeNull();
  });

  it("メールが一致しても、勝手には連結しない(連結していない Google では、同じメールのユーザーにも入れない)", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const result = await t.googleCallback({ sub: "g-same", email: "root@example.com" }, "signIn");
    expect(result.path).toBe("/login");
    expect(result.error).toBe("account_not_linked");
    expect(result.cookie).not.toContain("session_token");
    expect(await t.linkedProviders(sessionCookie)).toEqual([]);
  });

  it("ログイン中のユーザーに連結できる。Google のメールが、アカウントのメールと違っていてもよい(別のユーザーは作らない)", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const result = await t.googleCallback({ sub: "g-other", email: "other@gmail.com" }, "link", sessionCookie);
    expect(result.path).toBe("/account");
    expect(result.error).toBeNull();
    expect(await t.linkedProviders(sessionCookie)).toEqual(["google"]);
    expect(await t.userByEmail("other@gmail.com")).toBeNull();
  });

  it("連結したあとは、同じユーザーとして、Google でログインできる", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const rootId = await t.sessionUserId(sessionCookie);
    const identity = { sub: "g-linked", email: "other@gmail.com" };
    await t.googleCallback(identity, "link", sessionCookie);

    const result = await t.googleCallback(identity, "signIn");
    expect(result.path).toBe("/");
    expect(result.error).toBeNull();
    expect(rootId).toBeDefined();
    expect(await t.sessionUserId(result.cookie)).toBe(rootId);
  });

  it("解除すると、その Google では、もうログインできない。マジックリンクは、使える(最後の連結でも解除できる)", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const identity = { sub: "g-unlink", email: "other@gmail.com" };
    await t.googleCallback(identity, "link", sessionCookie);

    await t.auth.api.unlinkAccount({ body: { accountId: await t.googleAccountId(sessionCookie) }, headers: new Headers({ cookie: sessionCookie }) });
    const result = await t.googleCallback(identity, "signIn");

    expect(await t.linkedProviders(sessionCookie)).toEqual([]);
    expect(result.path).toBe("/login");
    expect(result.error).toBe("signup_disabled");
    expect(result.cookie).not.toContain("session_token");
    expect(await t.signInWithMagicLink("root@example.com")).toContain("session_token"); // メールでは、入れる
  });

  it("すでに別のユーザーのものである Google は、連結できない", async () => {
    const t = createTestAuth();
    const aliceCookie = await t.signInWithMagicLink("alice@example.com");
    const bobCookie = await t.signInWithMagicLink("bob@example.com");
    const identity = { sub: "g-shared", email: "shared@gmail.com" };
    await t.googleCallback(identity, "link", aliceCookie);

    const result = await t.googleCallback(identity, "link", bobCookie);
    expect(result.error).toBe("account_already_linked_to_different_user");
    expect(await t.linkedProviders(bobCookie)).toEqual([]);
  });

  it("ログインしていない人は、連結を始められない", async () => {
    const t = createTestAuth();
    await expect(t.auth.api.linkSocialAccount({ body: { provider: "google", callbackURL: "/account" }, headers: new Headers() })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });
});

describe("連結と解除は、最近ログインした人だけ(盗まれたセッションの悪用を防ぐ)", () => {
  it("古いセッションでは、連結を始められない", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    makeSessionsStale();

    await expect(t.auth.api.linkSocialAccount({ body: { provider: "google", callbackURL: "/account" }, headers: new Headers({ cookie: sessionCookie }) })).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "SESSION_NOT_FRESH" } });
    expect(await t.linkedProviders(sessionCookie)).toEqual([]);
    expect(t.notifyLinked).not.toHaveBeenCalled();
  });

  it("もう一度ログインすれば、連結できる", async () => {
    const t = createTestAuth();
    await t.signInWithMagicLink("root@example.com");
    makeSessionsStale();
    const freshCookie = await t.signInWithMagicLink("root@example.com");

    const result = await t.googleCallback({ sub: "g-again", email: "other@gmail.com" }, "link", freshCookie);
    expect(result.error).toBeNull();
    expect(await t.linkedProviders(freshCookie)).toEqual(["google"]);
  });

  it("古いセッションでは、解除できない(連結は残る)", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    await t.googleCallback({ sub: "g-old", email: "other@gmail.com" }, "link", sessionCookie);
    const accountId = await t.googleAccountId(sessionCookie);
    makeSessionsStale();

    await expect(t.auth.api.unlinkAccount({ body: { accountId }, headers: new Headers({ cookie: sessionCookie }) })).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "SESSION_NOT_FRESH" } });
    expect(await t.linkedProviders(sessionCookie)).toEqual(["google"]);
  });
});

describe("連結したときの、本人への知らせ", () => {
  it("連結した Google のアドレスではなく、アカウントのアドレスに知らせる", async () => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    await t.googleCallback({ sub: "g-notice", email: "other@gmail.com" }, "link", sessionCookie);
    expect(t.notifyLinked).toHaveBeenCalledTimes(1);
    expect(t.notifyLinked).toHaveBeenCalledWith({ to: "root@example.com", provider: "google" });
  });

  it("何も連結されなかったときは、知らせない", async () => {
    const t = createTestAuth();
    await t.signInWithMagicLink("root@example.com");
    await t.googleCallback({ sub: "g-none", email: "root@example.com" }, "signIn");
    expect(t.notifyLinked).not.toHaveBeenCalled();
  });

  it("知らせを送れなくても、連結そのものは成功する(ログには、エラーの名前だけ)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = createTestAuth(async () => {
      throw new Error("mail is down: friend@example.com");
    });
    const sessionCookie = await t.signInWithMagicLink("root@example.com");

    const result = await t.googleCallback({ sub: "g-mail-down", email: "other@gmail.com" }, "link", sessionCookie);
    expect(result.error).toBeNull();
    expect(await t.linkedProviders(sessionCookie)).toEqual(["google"]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("friend@example.com"); // エラーの message(宛先を含みうる)は、ログに出さない
  });
});

describe("保存した Google のトークンを使うエンドポイントは、HTTP では閉じる", () => {
  it.each([
    ["POST", "/api/auth/get-access-token"],
    ["POST", "/api/auth/refresh-token"],
    ["GET", "/api/auth/account-info?accountId=any"],
  ])("%s %s は、ログイン中でも、403", async (method, path) => {
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    await t.googleCallback({ sub: "g-token", email: "other@gmail.com" }, "link", sessionCookie);
    const init: RequestInit = method === "POST" ? { method, headers: { cookie: sessionCookie, "content-type": "application/json", origin: BASE }, body: JSON.stringify({ providerId: "google" }) } : { method, headers: { cookie: sessionCookie } };
    const res = await t.auth.handler(new Request(`${BASE}${path}`, init));
    expect(res.status).toBe(403);
  });
});

describe("許可リストから外した人は、連結済みの Google でも、入り直せない(アクセスを止める手段として効く)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("連結済みの Google でログインできていた人が、許可リストから外されると、Google では、新しいセッションを作れない", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "root@example.com");
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const identity = { sub: "g-removed", email: "other@gmail.com" };
    await t.googleCallback(identity, "link", sessionCookie);
    expect((await t.googleCallback(identity, "signIn")).cookie).toContain("session_token"); // 許可の中なら、入れる

    vi.stubEnv("ALLOWED_EMAILS", "someone-else@example.com"); // root を、許可リストから外す
    const result = await t.googleCallback(identity, "signIn");

    expect(result.cookie).not.toContain("session_token");
    expect(result.path).toBe("/login");
    expect(result.error).not.toBeNull();
  });

  it("すでにあるセッションは、外しても消えない(このフックは、作るときだけ。外した人のセッションは、別に消す。CLAUDE.md の手順)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "root@example.com");
    const t = createTestAuth();
    const sessionCookie = await t.signInWithMagicLink("root@example.com");
    const userId = await t.sessionUserId(sessionCookie);
    expect(userId).toBeDefined();

    vi.stubEnv("ALLOWED_EMAILS", "someone-else@example.com");
    expect(await t.sessionUserId(sessionCookie)).toBe(userId); // 使用中のセッションが、突然弾かれることはない
  });

  it("外したあとは、すでに届いていたマジックリンクでも、セッションを作れない。許可リストに戻せば、また入れる", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "root@example.com");
    const t = createTestAuth();
    await t.signInWithMagicLink("root@example.com"); // ユーザーを作る

    vi.stubEnv("ALLOWED_EMAILS", "someone-else@example.com");
    expect(await t.signInWithMagicLink("root@example.com")).not.toContain("session_token"); // リンクは検証できても、セッションの Cookie が出ない

    vi.stubEnv("ALLOWED_EMAILS", "root@example.com");
    expect(await t.signInWithMagicLink("root@example.com")).toContain("session_token");
  });
});

describe("googleCredentialsFromEnv", () => {
  it("両方そろっているときだけ、認証情報を返す(空白は除く)。足りなければ null(Google は使えない)", () => {
    expect(googleCredentialsFromEnv({ GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: " secret " })).toEqual({ clientId: "id", clientSecret: "secret" });
    expect(googleCredentialsFromEnv({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(googleCredentialsFromEnv({ GOOGLE_CLIENT_SECRET: "secret" })).toBeNull();
    expect(googleCredentialsFromEnv({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "  " })).toBeNull();
    expect(googleCredentialsFromEnv({})).toBeNull();
  });
});
