import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthOptions, IP_ADDRESS_HEADERS } from "@/lib/auth-options";
import { sessionAllowlistHooks } from "@/lib/session-allowlist";

// 守りの配線を、本物の設定(auth-options.ts。本番の auth.ts と同じ関数)で確かめる。
// 本番の設定から、次の行のどれかを消すと、ここが落ちる: セッションの許可リスト確認 / ユーザー作成の許可リスト確認 /
// メールを送る前の許可リスト確認 / トークンのハッシュ保存 / メールアドレス単位の回数制限の呼び出し / IP を読むヘッダー / 回数の DB 保存

const BASE = "http://localhost:3000";
const SECRET = "test-secret-test-secret-test-secret-123456";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setup(limited = false) {
  const delivered: { to: string; url: string }[] = [];
  const createdUsers: string[] = [];
  const store = { user: [], session: [], account: [], verification: [] };
  const isLoginLinkRequestLimited = vi.fn(async (_path: string, _body: unknown) => limited);
  const options = createAuthOptions({
    database: memoryAdapter(store),
    google: null,
    notifyLinked: async () => {},
    deliverLoginLink: (args) => {
      delivered.push(args);
    },
    isLoginLinkRequestLimited,
    onUserCreated: async (user) => {
      createdUsers.push(user.id);
    },
  });
  const auth = betterAuth({ baseURL: BASE, secret: SECRET, ...options, rateLimit: { enabled: false } }); // IP 単位の制限は、下で設定の値を確かめる
  const requestLink = (email: string) =>
    auth.handler(new Request(`${BASE}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, callbackURL: "/" }) }));
  return { options, auth, store, delivered, createdUsers, isLoginLinkRequestLimited, requestLink };
}

describe("createAuthOptions: 設定の値", () => {
  it("IP 単位の回数制限は、DB に記録し(サーバーレスで、プロセスをまたいで数える)、開発でも有効", () => {
    const { options } = setup();
    expect(options.rateLimit).toEqual({ enabled: true, storage: "database" });
  });

  it("IP は、Vercel が接続元だけを入れるヘッダーを先に、x-forwarded-for を次に読む(複数の値の x-forwarded-for だけに頼ると、全員が 1 つの枠になる)", () => {
    const { options } = setup();
    expect(IP_ADDRESS_HEADERS).toEqual(["x-vercel-forwarded-for", "x-forwarded-for"]);
    expect(options.advanced.ipAddress.ipAddressHeaders).toBe(IP_ADDRESS_HEADERS);
  });

  it("セッションを作るときの許可リスト確認(sessionAllowlistHooks)が、つながっている", () => {
    const { options } = setup();
    expect(options.databaseHooks.session).toBe(sessionAllowlistHooks);
  });

  it("メールの変更と退会は、有効にしていない(許可リストの判定対象 user.email を、本人が書き換えられない。有効にするなら、許可リストとの関係を決めてから)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    const { options, auth, requestLink, delivered } = setup();
    expect("user" in options).toBe(false); // user.changeEmail / user.deleteUser の設定が無い(Better Auth の既定は、どちらも無効)

    await requestLink("friend@example.com");
    const token = new URL(delivered[0].url).searchParams.get("token") ?? "";
    const cookies = (await auth.api.magicLinkVerify({ query: { token }, headers: new Headers(), asResponse: true })).headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const post = (path: string, body: object) =>
      auth.handler(new Request(`${BASE}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: cookies }, body: JSON.stringify(body) }));

    // 「400 以上」だけでは、セッションが古い・無いときの 401/403 でも通ってしまうので、無効であることを示す符号まで見る
    const changeEmail = await post("change-email", { newEmail: "stranger@example.com" });
    expect(changeEmail.status).toBe(400);
    expect(await changeEmail.json()).toMatchObject({ code: "CHANGE_EMAIL_DISABLED" });
    // 退会は、無効のとき、ルート自体が無い(存在しない道と同じ 404)
    expect((await post("delete-user", {})).status).toBe(404);
    expect((await post("no-such-route", {})).status).toBe(404);
    const updateUser = await post("update-user", { email: "stranger@example.com" });
    expect(updateUser.status).toBe(400);
    expect(await updateUser.json()).toMatchObject({ code: "EMAIL_CAN_NOT_BE_UPDATED" });
  });

  it("ユーザーを作るときは、許可リストの外のアドレスでは作らず、中なら作る", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    const { options } = setup();
    expect(await options.databaseHooks.user.create.before({ email: "stranger@example.com" })).toBe(false);
    expect(await options.databaseHooks.user.create.before({ email: "Friend@Example.com" })).toBe(true);
  });
});

describe("createAuthOptions: ログインのメールの依頼(本物の Better Auth・メモリ上の DB)", () => {
  it("許可リストの中のアドレスには送り、外のアドレスには送らない。どちらも、応答は同じ(登録の有無を教えない)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delivered, requestLink } = setup();

    const allowed = await requestLink("friend@example.com");
    const denied = await requestLink("stranger@example.com");

    expect(delivered.map((d) => d.to)).toEqual(["friend@example.com"]);
    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(200);
    expect(await denied.json()).toEqual(await allowed.json());
  });

  it("回数の制限に引っかかったら、429 で、メールは送らない。制限には、パスと本文が渡る", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    const { delivered, isLoginLinkRequestLimited, requestLink } = setup(true);

    const res = await requestLink("friend@example.com");

    expect(res.status).toBe(429);
    expect(delivered).toEqual([]);
    expect(isLoginLinkRequestLimited).toHaveBeenCalledWith("/sign-in/magic-link", expect.objectContaining({ email: "friend@example.com" }));
  });

  it("トークンは、DB にハッシュで保存する(DB に、そのままのトークンは無い)。リンクを開くと、ユーザーとセッションができ、プロフィールの作成が呼ばれる", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "friend@example.com");
    const { auth, store, delivered, createdUsers, requestLink } = setup();

    await requestLink("friend@example.com");
    const token = new URL(delivered[0].url).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(store.verification.length).toBeGreaterThan(0);
    expect(JSON.stringify(store.verification)).not.toContain(token ?? "unreachable"); // 保存されているのは、ハッシュ

    const verified = await auth.api.magicLinkVerify({ query: { token: token ?? "" }, headers: new Headers(), asResponse: true });
    expect(verified.headers.getSetCookie().join(";")).toContain("session_token");
    expect(store.session).toHaveLength(1);
    expect(createdUsers).toHaveLength(1);
  });
});
