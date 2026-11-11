"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { unlinkErrorMessage } from "@/lib/linked-accounts";

// Google の連結を解除する(アカウントのページ)。解除しても、メールのリンクでは、これまでどおりログインできる。解除は、Better Auth の連結の id を渡す。
// 失敗の文は、ここでは出さず、onError で渡す(行の下に、全幅で出すため。google-link-controls.tsx)
export function UnlinkGoogleButton({ accountId, onError }: { accountId: string; onError: (message: string | null) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm("Google の連結を解除しますか?解除しても、メールのリンクでは、これまでどおりログインできます。")) return;
    setBusy(true);
    onError(null);
    try {
      const { error: failure } = await authClient.unlinkAccount({ accountId });
      if (failure) {
        onError(unlinkErrorMessage(failure));
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      onError("通信に失敗しました。もう一度試してください。");
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={buttonClass({ variant: "secondary" })}>
      {busy ? "解除中..." : "連結を解除する"}
    </button>
  );
}
