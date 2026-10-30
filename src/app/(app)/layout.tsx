import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUserId } from "@/lib/current-user";

// ログイン必須のページ(ダッシュボード・日の詳細・編集)の共通レイアウト
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">
            Habit and Health Tracker
          </Link>
          <SignOutButton />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </main>
    </>
  );
}

// 未ログインなら /login へ送る(入口の確認。データを扱う関数でも getCurrentUserId を呼ぶこと)
async function AuthGate({ children }: { children: React.ReactNode }) {
  await getCurrentUserId();
  return children;
}
