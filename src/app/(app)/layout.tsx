import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { UserEmail } from "@/components/user-email";
import { getCurrentUserId } from "@/lib/current-user";

// ログイン必須のページ(ダッシュボード・日の詳細・編集)の共通レイアウト
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-line print:hidden">
        <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold">
            {/* ロゴ(512px の webp。next/image が表示の大きさ(28px)に縮めて出す。ログイン画面の大きい表示にも同じファイルを使う)。飾りなので alt は空。shrink-0: 横並びの中で潰れないように */}
            <Image src="/logo.webp" alt="" width={28} height={28} priority className="shrink-0" />
            Habit and Health Tracker
          </Link>
          <div className="flex items-center gap-4">
            {/* セッションを読むので、Suspense の内側に置く */}
            <Suspense fallback={null}>
              <UserEmail />
            </Suspense>
            {/* 広い画面では、メールアドレスのメニュー(user-email.tsx)にログアウトがあるので、スマホ幅だけ出す */}
            <div className="sm:hidden">
              <SignOutButton />
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:p-0">
        <Suspense fallback={<p className="text-ink-muted">読み込み中...</p>}>
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
