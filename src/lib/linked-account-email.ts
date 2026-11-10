import { APP_TIME_ZONE } from "@/lib/time-zone";

// ログイン方法が連結されたときに、本人のメールへ送る知らせ。身に覚えのない連結に、気づけるように
// (連結できるのは、ログイン中の本人だけだが、セッションが盗まれた場合に備える)。宛先は、連結した Google のアドレスではなく、アカウントのアドレス。
// 本文に入れるのは、自分たちの名前の表と日時だけ(連結した相手のアドレスや名前は、入れない)
const PROVIDER_LABELS = new Map([["google", "Google"]]);

const formatter = new Intl.DateTimeFormat("ja-JP", { timeZone: APP_TIME_ZONE, dateStyle: "medium", timeStyle: "short" });

export function linkedAccountEmail(provider: string, at: Date): { subject: string; text: string } {
  const label = PROVIDER_LABELS.get(provider);
  const what = label ? `${label} のアカウント` : "新しいログイン方法";
  const line = `${formatter.format(at)} に、${what}が、あなたのアカウントに連結されました。`;
  const advice = ["あなたが連結したのであれば、何もする必要はありません。", "身に覚えがないときは、メールのリンクでログインして、アカウントのページ(ヘッダーのメールアドレス)から、連結を解除してください。"];
  return { subject: "ログイン方法が追加されました(Habit and Health Tracker)", text: [line, "", ...advice].join("\n") };
}
