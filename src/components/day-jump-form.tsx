"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/button";
import { isValidDateString, todayString } from "@/lib/date";

// ダッシュボードの「日付を選んで開く」: 日を選んで、その日の詳細ページへ移動する(初期値は今日)。一覧に出ない古い日を、日付で指して開くための入口。
// 記録のある日は詳細にまとまって見え、無い日は詳細の「記録する」から始める(同じ日を二重に作らない)。未来の日付は選べない
// 今日の日付は途中で変わらない扱い(ページを開き直せば更新される)ので、購読する対象は無い
const subscribeNothing = () => () => {};

export function DayJumpForm() {
  const router = useRouter();
  // 今日は端末のローカル時間で決まる。サーバー側の描画(空)と食い違わないよう、ブラウザ側でだけ値を読む
  const today = useSyncExternalStore(subscribeNothing, todayString, () => "");
  const [chosen, setChosen] = useState<string | null>(null); // 本人が選んだ日。選ぶまでは今日
  const date = chosen ?? today;
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidDateString(date)) {
      setError("日付を選んでください。");
      return;
    }
    if (today !== "" && date > today) {
      setError("未来の日付は選べません。");
      return;
    }
    setError(null);
    router.push(`/days/${date}`);
  }

  // noValidate: ブラウザ標準のチェック(環境ごとの文言)ではなく、下の自前のメッセージで統一する
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="day-jump-date" className="sr-only">
          開く日
        </label>
        <input
          id="day-jump-date"
          type="date"
          value={date}
          max={today || undefined}
          onChange={(event) => setChosen(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "day-jump-date-error" : undefined}
          className="rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink"
        />
        <button type="submit" className={buttonClass()}>
          開く
        </button>
      </div>
      {error && (
        <p id="day-jump-date-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
