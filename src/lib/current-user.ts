import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// ログイン中のセッション。未ログインなら null
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

// user_id の取得はここに集約する。未ログインなら /login へ送る。
// データを読み書きする関数は、必ず先にこれを呼び、返ってきた id でクエリを絞る
// (レイアウトのチェックだけでは、ページ遷移のたびに再実行されないので足りない)
export async function getCurrentUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user.id;
}
