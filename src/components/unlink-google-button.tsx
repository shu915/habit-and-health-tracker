"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { unlinkErrorMessage } from "@/lib/linked-accounts";

// Google の連結を解除する(アカウントのページ)。解除しても、メールのリンクでは、これまでどおりログインできる。解除は、Better Auth の連結の id を渡す
export function UnlinkGoogleButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm("Google の連結を解除しますか?解除しても、メールのリンクでは、これまでどおりログインできます。")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await authClient.unlinkAccount({ accountId });
      if (failure) {
        setError(unlinkErrorMessage(failure));
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("通信に失敗しました。もう一度試してください。");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={onClick} disabled={busy} className={buttonClass({ variant: "secondary" })}>
        {busy ? "解除中..." : "連結を解除する"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
