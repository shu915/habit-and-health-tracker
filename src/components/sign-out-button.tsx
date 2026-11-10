"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/button";
import { authClient } from "@/lib/auth-client";

// ログアウト。見た目は 3 通り: header(ヘッダーの文字。スマホ幅)/ menu(メールアドレスにマウスを乗せたときのメニューの 1 行)/ page(アカウントのページのボタン)
const VARIANTS = {
  header: "text-sm text-ink-muted hover:underline",
  menu: "w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-neutral focus-visible:bg-neutral",
  page: buttonClass({ variant: "secondary" }),
} as const;

export function SignOutButton({ variant = "header" }: { variant?: keyof typeof VARIANTS }) {
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
    <div className={variant === "menu" ? "flex flex-col" : "flex items-center gap-2"}>
      {failed && <span className="text-sm text-red-600 dark:text-red-400">ログアウトに失敗しました</span>}
      <button type="button" onClick={onClick} className={VARIANTS[variant]}>
        ログアウト
      </button>
    </div>
  );
}
