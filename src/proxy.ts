import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// 未ログイン(セッション Cookie が無い)なら /login へ HTTP リダイレクトする。
// Cookie の有無を見るだけの入口の確認で、本当の認可ではない。
// データを扱う関数は、必ず getCurrentUserId() でセッションを検証すること
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // 認証 API、ログインページ、静的ファイル、アイコンと manifest(ログイン前のページのタブや、ホーム画面への追加でも読まれる)は除く。
  // 前方一致で除外すると /apiary や /login-history のような将来のページまで外れるので、パスの区切りまで書く
  matcher: [
    "/((?!api/|login$|_next/static/|_next/image|favicon\\.ico$|icon\\.png$|apple-icon\\.png$|manifest\\.webmanifest$|icon-192\\.png$|icon-512\\.png$|icon-maskable-512\\.png$|logo\\.webp$).*)",
  ],
};
