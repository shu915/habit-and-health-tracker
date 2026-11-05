import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppMark } from "@/components/app-mark";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/current-user";

// セッションはリクエスト時に読むので、Suspense の内側に置く(読み込み中の表示を先に出すため)
export default function LoginPage() {
  return (
    // ロゴ(マークを大きく、その下にアプリ名)を中央に置き、その下にログインの枠。アプリ名が主題なので、この画面だけアプリ名を h1 にする
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center gap-8 px-4 pt-24 pb-16">
      <div className="flex flex-col items-center gap-4">
        <AppMark size={72} />
        <h1 className="text-center text-[26px] leading-8 font-bold">Habit and Health Tracker</h1>
      </div>
      <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}

async function LoginContent() {
  if (await getSession()) redirect("/");
  return <LoginForm />;
}
