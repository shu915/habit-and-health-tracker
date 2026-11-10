// メールを送る。開発とテストは、コンソールに出すだけ(ログインリンクを、画面の端末で読めるように)。
// 本番は、Resend の REST API で送る(SDK は使わず、fetch で呼ぶ: 依存を足さずに済む)。
//   RESEND_API_KEY  必須(本番)。Resend の API キー
//   MAIL_FROM       必須(本番)。送信元。例: Habit and Health Tracker <login@example.com>(ドメインは Resend で認証済みのもの)
//   MAIL_REPLY_TO   任意。返信先(実在する受信箱)。無ければ、返信先を付けない
//   EMAIL_TRANSPORT 任意。resend にすると、開発でも Resend で送る(本物のメールが届くかの確認用。キーと送信元も要る)
// 本番では、宛先・件名・本文(ログインリンク)を、ログに出さない。リンクは、そのまま使える合鍵のため

// 文言が、宛先・本文・キーを含まないと分かっている、自分たちのエラー。ログには、これだけ message を出す(それ以外は、名前だけ。describeEmailError)
export class EmailConfigError extends Error {}
export class EmailSendError extends Error {}

// ログに出すための、失敗の説明。自分たちのエラーは message(設定が足りない・Resend の状態)、それ以外(通信や不正なヘッダー値などの、外から来るエラー)は、名前だけ。
// 外から来るエラーの message や cause には、ヘッダーの値(API キー)などが入りうるので、出さない
export function describeEmailError(error: unknown): string {
  if (error instanceof EmailConfigError || error instanceof EmailSendError) return error.message;
  return error instanceof Error ? error.name : "unknown";
}

export type Email = { to: string; subject: string; text: string; html?: string };

type Env = { NODE_ENV?: string; RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_REPLY_TO?: string; EMAIL_TRANSPORT?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type Transport = { kind: "console" } | { kind: "resend"; apiKey: string; from: string; replyTo: string | null };

// どの方法で送るか。本番(と、EMAIL_TRANSPORT=resend の開発)は Resend で、キーと送信元が無ければエラー(黙って送らない・コンソールに出さない)
export function resolveTransport(env: Env): Transport {
  const useResend = env.NODE_ENV === "production" || env.EMAIL_TRANSPORT === "resend";
  if (!useResend) return { kind: "console" };
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailConfigError("メール送信の設定が足りません(RESEND_API_KEY と MAIL_FROM が要ります。.env.example を参照)");
  return { kind: "resend", apiKey, from, replyTo: env.MAIL_REPLY_TO?.trim() || null };
}

export async function sendEmail({ to, subject, text, html }: Email): Promise<void> {
  const transport = resolveTransport(process.env);
  if (transport.kind === "console") {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${transport.apiKey}`, "Content-Type": "application/json", "User-Agent": "habit-and-health-tracker" },
    body: JSON.stringify({ from: transport.from, to: [to], subject, text, ...(html ? { html } : {}), ...(transport.replyTo ? { reply_to: transport.replyTo } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    // 失敗の理由は、Resend が返す種類と状態だけを残す(宛先・本文は、エラーに入れない)
    const detail = await response.json().then((body: unknown) => (typeof body === "object" && body !== null && "name" in body ? String(body.name) : "")).catch(() => "");
    throw new EmailSendError(`Resend がメールを受け付けませんでした(状態 ${response.status}${detail ? `、${detail}` : ""})`);
  }
}
