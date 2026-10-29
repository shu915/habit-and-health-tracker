type Email = { to: string; subject: string; text: string };

// 開発中はコンソールに出すだけ。本番のメール送信方法は未決(CLAUDE.md の未決事項)なので、
// 本番ではエラーにして、ログインリンクがホストのログに残ったり黙って消えたりするのを防ぐ
export async function sendEmail({ to, subject, text }: Email) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("メール送信は未設定です(本番の送信方法を決めてから実装する)");
  }
  console.log(`[email] to=${to} subject=${subject}\n${text}`);
}
