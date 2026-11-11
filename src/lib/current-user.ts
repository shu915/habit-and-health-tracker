import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isEmailAllowed } from "@/lib/allowlist";
import { auth } from "@/lib/auth";

// ログイン中のセッション。未ログインなら null。
// **許可リスト(ALLOWED_EMAILS)の外の人のセッションは、あっても null にする**(読むたびに確かめる)。
// 許可リストから外しても、すでにあるセッションは使うたびに延びて、期限では切れないので、`session` の行を消し忘れても、外した人が入れないように。
// データを扱う関数も、画面も、ここを通る。許可リストが空のとき、本番は誰も許可しない(allowlist.ts)ので、設定を誤ると、全員が入れなくなる側に倒れる
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && isEmailAllowed(session.user.email) ? session : null;
});

// user_id の取得はここに集約する。未ログインなら /login へ送る。
// データを読み書きする関数は、必ず先にこれを呼び、返ってきた id でクエリを絞る
// (レイアウトのチェックだけでは、ページ遷移のたびに再実行されないので足りない)
export async function getCurrentUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user.id;
}
