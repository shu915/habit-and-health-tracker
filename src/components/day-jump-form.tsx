"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { isValidDateString, todayString } from "@/lib/date";

// ダッシュボードの「日付を選んで編集」: 日を選んで、その日の編集ページへ移動する(初期値は今日)。
// 新規か編集かは分けない。その日の記録がすでにあれば編集ページに入力済みの値が出て、無ければ空のフォームが出る
// (同じ日を二重に作らない)。未来の日付は選べない
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
    router.push(`/days/${date}/edit`);
  }

  // noValidate: ブラウザ標準のチェック(環境ごとの文言)ではなく、下の自前のメッセージで統一する
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="day-jump-date" className="sr-only">
          編集する日
        </label>
        <input
          id="day-jump-date"
          type="date"
          value={date}
          max={today || undefined}
          onChange={(event) => setChosen(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "day-jump-date-error" : undefined}
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          編集
        </button>
      </div>
      {error && (
        <p id="day-jump-date-error" role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
