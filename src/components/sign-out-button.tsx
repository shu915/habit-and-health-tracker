"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/button";
import { LogoutIcon } from "@/components/menu-icons";
import { authClient } from "@/lib/auth-client";

// ログアウト。見た目は 2 通り: menu(ヘッダーのアカウントのメニューの 1 行。アイコンつき)/ page(アカウントのページのボタン)
export function SignOutButton({ variant = "page" }: { variant?: "menu" | "page" }) {
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

  // 失敗は重要な知らせなので赤。読み上げにも、すぐ伝わるように role="alert"
  const failure = failed && (
    <span role="alert" className={variant === "menu" ? "px-5 pb-3 text-sm text-red-600 dark:text-red-400" : "text-sm text-red-600 dark:text-red-400"}>
      ログアウトに失敗しました
    </span>
  );

  if (variant === "menu") {
    return (
      <div role="none" className="flex flex-col">
        <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] text-ink hover:bg-neutral focus-visible:bg-neutral focus-visible:outline-none">
          <LogoutIcon />
          ログアウト
        </button>
        {failure}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {failure}
      <button type="button" onClick={onClick} className={`${buttonClass({ variant: "secondary" })} inline-flex items-center gap-2`}>
        <LogoutIcon />
        ログアウト
      </button>
    </div>
  );
}
