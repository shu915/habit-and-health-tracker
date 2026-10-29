// ログインを許可するメールアドレス(ホワイトリスト)。環境変数 ALLOWED_EMAILS にカンマ区切りで置く。
// 空のとき: 本番では誰も許可しない / 開発・テストでは全員許可する(手元で動かしやすくするため)
export function isEmailAllowed(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");

  if (allowed.length === 0) return process.env.NODE_ENV !== "production";
  return allowed.includes(email.trim().toLowerCase());
}
