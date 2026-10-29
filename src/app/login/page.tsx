import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/current-user";

// セッションはリクエスト時に読むので、Suspense の内側に置く(cacheComponents)
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-6 pt-24">
      <h1 className="text-2xl font-semibold">ログイン</h1>
      <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}

async function LoginContent() {
  if (await getSession()) redirect("/");
  return <LoginForm />;
}
