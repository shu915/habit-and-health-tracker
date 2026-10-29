"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function onClick() {
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setFailed(true);
        return;
      }
    } catch {
      setFailed(true);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {failed && <span className="text-sm text-red-600">ログアウトに失敗しました</span>}
      <button type="button" onClick={onClick} className="text-sm text-zinc-500 hover:underline">
        ログアウト
      </button>
    </div>
  );
}
