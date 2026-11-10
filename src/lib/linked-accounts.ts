// アカウントのページで使う、連結の表示まわりの小さな関数(DB も Better Auth も読まない)。
// Better Auth の連結の記録(account)のうち、使うのは id とプロバイダー名だけ。解除は、プロバイダー名ではなく、この id を渡す。
export type LinkedAccount = { id: string; providerId: string };

export const PROVIDER_LABELS: Record<string, string> = { google: "Google" };

export function findLinkedAccountId(accounts: readonly LinkedAccount[], providerId: string): string | null {
  return accounts.find((account) => account.providerId === providerId)?.id ?? null;
}

// 連結と解除は、最近ログインした人だけ。生のエラーではなく、直し方を伝える(ログイン画面は、ログイン中の人を、ホームへ戻すので、手順はホームのログアウトから)
const signInAgain = (doing: string) => `安全のため、いったんログアウトして、メールのリンクでもう一度ログインしてから、${doing}をやり直してください(連結と解除は、5 分以内にログインした人だけができます)。`;

export function linkErrorMessage(error: { code?: string }): string {
  return error.code === "SESSION_NOT_FRESH" ? signInAgain("連結") : "Google の連結を始められませんでした。もう一度試してください。";
}

export function unlinkErrorMessage(error: { code?: string }): string {
  return error.code === "SESSION_NOT_FRESH" ? signInAgain("解除") : "Google の連結を解除できませんでした。もう一度試してください。";
}

// ログイン画面に戻されたときの、理由(Better Auth が、?error= で付ける)。未連結の Google では入れない、が主。知らない理由は、一般の文言にする
export function googleSignInErrorMessage(error: string | undefined): string | null {
  if (error === undefined || error === "") return null;
  if (error === "signup_disabled" || error === "account_not_linked") {
    return "この Google アカウントは、まだ連結されていません。メールのリンクでログインして、アカウントのページ(ヘッダーのメールアドレス)から連結してください。";
  }
  return "Google でログインできませんでした。もう一度試すか、メールのリンクでログインしてください。";
}

// アカウントのページに戻されたときの、連結が失敗した理由(Better Auth が、?error= で付ける)
export function linkReturnErrorMessage(error: string | undefined): string | null {
  if (error === undefined || error === "") return null;
  if (error === "account_already_linked_to_different_user") return "この Google アカウントは、すでに別のアカウントに連結されています。連結できませんでした。";
  return "Google を連結できませんでした。もう一度試してください。";
}
