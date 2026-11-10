// ログインのメール(マジックリンク)の件名・本文。DB も外部サービスも読まない、文面だけを作る関数。
// リンクは、そのまま使える合鍵なので、本文に入れるのはリンクだけ(宛先やアドレスは入れない)。本文に出す有効期限は、auth.ts の expiresIn と同じ値を使う
export const MAGIC_LINK_EXPIRES_IN_SECONDS = 5 * 60;

const APP_NAME = "Habit and Health Tracker";
const ACCENT = "#346b49"; // globals.css の --accent に合わせた緑(メールには CSS 変数が使えないので、色の値を直接書く)

// HTML に埋め込む文字を、エスケープする(リンクの & などが、HTML として壊れないように)
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function loginEmail(url: string): { subject: string; text: string; html: string } {
  const minutes = MAGIC_LINK_EXPIRES_IN_SECONDS / 60;
  const lead = `${APP_NAME} へのログインリンクです。下のボタンを押すと、ログインできます。`;
  const notes = [`このリンクは ${minutes} 分間、1 回だけ使えます。`, "ログインを依頼した覚えがないときは、このメールを無視してください(何も起こりません)。", "このリンクは、ほかの人に送らないでください。"];

  const text = [lead, "", "ボタンが使えないときは、次のリンクをブラウザに貼り付けてください。", url, "", ...notes].join("\n");

  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:24px;background:#f6f4f0;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif;color:#23211d;">
    <div style="max-width:480px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px;">
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${escapeHtml(lead)}</p>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">ログインする</a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:#57524a;">ボタンが使えないときは、次のリンクをブラウザに貼り付けてください。</p>
      <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#57524a;word-break:break-all;">${safeUrl}</p>
      <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:#57524a;">
${notes.map((note) => `        <li>${escapeHtml(note)}</li>`).join("\n")}
      </ul>
    </div>
  </body>
</html>`;

  return { subject: `ログインリンク(${APP_NAME})`, text, html };
}
