"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ReportProcessingIndicator } from "@/components/processing-indicator";

// 作成中のレポートの画面(docs/ai-feedback.md)。AI の呼び出しは裏で続いているので、数秒おきに、サーバーに状態を見に行く(router.refresh)。
// できた(done)か失敗(failed)に変わると、ページが、その表示に切り替わる(この部品は外れて、数えるのが止まる)。
// 経過秒数は、サーバー(DB の時計)から渡された値の続きから数える。ページを閉じても、作成は続く(あとで一覧から開ける)
export const POLL_INTERVAL_MS = 4000;

export function ReportProgress({ elapsedSeconds }: { elapsedSeconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return <ReportProcessingIndicator startSeconds={elapsedSeconds} />;
}
