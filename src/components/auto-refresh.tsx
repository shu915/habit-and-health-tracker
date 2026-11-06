"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { POLL_INTERVAL_MS } from "@/components/report-progress";

// 作成中のレポートがあるあいだ、数秒おきに、サーバーに状態を見に行く(router.refresh)。できたら、ページの表示が切り替わる。
// 置いている間だけ動き、外れる(作成中が無くなる)と止まる。画面は動かさず、一覧の中の「作成中」が、できたレポートに変わるだけ
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
