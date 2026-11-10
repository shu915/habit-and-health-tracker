"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { linkErrorMessage } from "@/lib/linked-accounts";

// Google を連結する(アカウントのページ)。ログイン中の本人が、自分で押す。成功すると、ブラウザが Google へ送られ、戻ってくる(この呼び出しは、失敗のときだけ返る)
export function LinkGoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google から、ブラウザの戻るボタンで戻ると、「移動中...」のままのページが、キャッシュから復元される
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setBusy(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await authClient.linkSocial({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account" });
      if (failure) {
        setError(linkErrorMessage(failure));
        setBusy(false);
      }
    } catch {
      setError("通信に失敗しました。もう一度試してください。");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={onClick} disabled={busy} className={buttonClass({ variant: "secondary" })}>
        {busy ? "Google へ移動中..." : "Google を連結する"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
