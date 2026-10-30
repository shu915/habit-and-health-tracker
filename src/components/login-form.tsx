"use client";

import { useState } from "react";
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        ログインリンクを送る
      </button>
      {status === "sent" && (
        // 登録の有無は教えないため、どのアドレスでも同じ文言を出す(auth.ts の sendMagicLink を参照)
        <div className="flex flex-col gap-1 text-sm text-zinc-500">
          <p>メールを送りました。届いたリンクを開いてください。</p>
          <p className="text-xs">
            届かない場合は、アドレスが間違っているか、登録されていない可能性があります。迷惑メールのフォルダも確認し、それでも届かなければ、管理者(このアプリを作った人)に連絡してください。
          </p>
        </div>
      )}
      {status === "rate-limited" && (
        <p className="text-sm text-red-600">
          短い間に何度も送信しました。しばらく待ってからもう一度試してください。
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">送信に失敗しました。もう一度試してください。</p>
      )}
    </form>
  );
}
