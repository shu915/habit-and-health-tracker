"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { linkErrorMessage } from "@/lib/linked-accounts";

// Google を連結する(アカウントのページ)。ログイン中の本人が、自分で押す。成功すると、ブラウザが Google へ送られ、戻ってくる(この呼び出しは、失敗のときだけ返る)。
// 失敗の文は、ここでは出さず、onError で渡す(行の下に、全幅で出すため。google-link-controls.tsx)
export function LinkGoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);

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
    onError(null);
    try {
      const { error: failure } = await authClient.linkSocial({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account" });
      if (failure) {
        onError(linkErrorMessage(failure));
        setBusy(false);
      }
    } catch {
      onError("通信に失敗しました。もう一度試してください。");
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={buttonClass({ variant: "secondary" })}>
      {busy ? "Google へ移動中..." : "Google を連結する"}
    </button>
  );
}
