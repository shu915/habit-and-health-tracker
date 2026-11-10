import { describe, expect, it } from "vitest";
import { findLinkedAccountId, googleSignInErrorMessage, linkErrorMessage, linkReturnErrorMessage, unlinkErrorMessage } from "./linked-accounts";

describe("findLinkedAccountId", () => {
  const accounts = [{ id: "acc-1", providerId: "google" }, { id: "acc-2", providerId: "github" }];

  it("プロバイダーの連結の id を返す(解除は、プロバイダー名ではなく、この id を渡す)", () => {
    expect(findLinkedAccountId(accounts, "google")).toBe("acc-1");
    expect(findLinkedAccountId(accounts, "github")).toBe("acc-2");
  });

  it("連結が無ければ null", () => {
    expect(findLinkedAccountId(accounts, "line")).toBeNull();
    expect(findLinkedAccountId([], "google")).toBeNull();
  });
});

describe("エラーの文言", () => {
  it("新しいログインを求められたときは、直し方(ログアウトして、メールでログインし直す)を伝える。生のエラーは出さない", () => {
    expect(linkErrorMessage({ code: "SESSION_NOT_FRESH" })).toContain("メールのリンクでもう一度ログイン");
    expect(linkErrorMessage({ code: "SESSION_NOT_FRESH" })).toContain("連結");
    expect(unlinkErrorMessage({ code: "SESSION_NOT_FRESH" })).toContain("解除");
  });

  it("それ以外は、一般の文言(待てば直る・やり直せば直る案内)", () => {
    expect(linkErrorMessage({ code: "ANYTHING" })).toContain("もう一度試してください");
    expect(unlinkErrorMessage({})).toContain("もう一度試してください");
  });
});

describe("googleSignInErrorMessage(ログイン画面に戻されたときの理由)", () => {
  it("連結していない Google は、メールでログインして、アカウントのページから連結する、と案内する", () => {
    for (const error of ["signup_disabled", "account_not_linked"]) expect(googleSignInErrorMessage(error)).toContain("まだ連結されていません");
  });

  it("理由が無ければ null。知らない理由は、一般の文言(相手から来た文字列は、そのまま出さない)", () => {
    expect(googleSignInErrorMessage(undefined)).toBeNull();
    expect(googleSignInErrorMessage("")).toBeNull();
    const unknown = googleSignInErrorMessage("<script>x");
    expect(unknown).toContain("Google でログインできませんでした");
    expect(unknown).not.toContain("script");
  });
});

describe("linkReturnErrorMessage(連結に失敗して、アカウントのページに戻されたとき)", () => {
  it("すでに別のアカウントに連結されている Google は、その旨を伝える。知らない理由は、一般の文言。理由が無ければ null", () => {
    expect(linkReturnErrorMessage("account_already_linked_to_different_user")).toContain("すでに別のアカウントに連結されています");
    expect(linkReturnErrorMessage("whatever<script>")).toBe("Google を連結できませんでした。もう一度試してください。");
    expect(linkReturnErrorMessage(undefined)).toBeNull();
    expect(linkReturnErrorMessage("")).toBeNull();
  });
});
