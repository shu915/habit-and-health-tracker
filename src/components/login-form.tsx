"use client";

import { useState } from "react";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";

type Status = "idle" | "sending" | "sent" | "error" | "rate-limited";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    try {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
      if (!error) setStatus("sent");
      else setStatus(error.status === 429 ? "rate-limited" : "error");
    } catch {
      // ネットワーク断など。ボタンが押せないままにならないよう、エラー表示に戻す
      setStatus("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 rounded-lg bg-surface-raised p-6">
      <label htmlFor="email" className="text-sm font-medium">
        メールアドレス
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="rounded-md border border-line bg-surface-raised px-3 py-2.5 text-base text-ink placeholder:text-ink-subtle"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className={`${buttonClass()} min-h-11 w-full`}
      >
        ログインリンクを送る
      </button>
      {status !== "sent" && <p className="mt-1 text-xs leading-relaxed text-ink-muted">パスワードは使いません。届いたメールのリンクを開くとログインできます。</p>}
      {status === "sent" && (
        // 登録の有無は教えないため、どのアドレスでも同じ文言を出す(auth.ts の sendMagicLink を参照)
        <div className="flex flex-col gap-1 text-sm text-ink-muted">
          <p>メールを送りました。届いたリンクを開いてください。</p>
          <p className="text-xs">
            届かない場合は、アドレスが間違っているか、登録されていない可能性があります。迷惑メールのフォルダも確認し、それでも届かなければ、管理者(このアプリを作った人)に連絡してください。
          </p>
        </div>
      )}
      {status === "rate-limited" && (
        <p role="status" className="text-sm text-ink">
          短い間に何度も送信しました。しばらく待ってからもう一度試してください。
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm text-red-600">送信に失敗しました。もう一度試してください。</p>
      )}
    </form>
  );
}
