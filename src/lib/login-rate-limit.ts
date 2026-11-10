import "server-only";
import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginLinkRequests } from "@/db/schema";

// ログインのメール(マジックリンク)の、メールアドレス単位の回数制限。
// Better Auth の回数制限は、IP アドレス単位(同じ人が、IP を変えれば、すり抜ける)。悪意のある人が、友人のアドレスを知っていて、
// IP を変えながら連打すると、友人の受信箱が荒れ、メールの送信枠(Resend)が減る。それをアドレス単位で止める。
// **許可リストの内でも外でも、同じように数えて、同じ応答にする**(許可リストの内の人にだけ「多すぎる」と返すと、そのアドレスが登録されているかが分かってしまう)。
// 断った要求は、記録しない(断られ続けても、解除が延びない)。「数える → 足す」は、アドレス単位のロックで直列にする(同時に来ても、上限を超えない)。
// 開発は、手で何度も試すので、上限なし(食事の推定の上限と同じ扱い)

const MAX_EMAIL_LENGTH = 320;

export type LoginLinkLimits = { perWindow: number; windowMinutes: number; perDay: number };

export const LOGIN_LINK_LIMITS: LoginLinkLimits =
  process.env.NODE_ENV === "development" ? { perWindow: Infinity, windowMinutes: 10, perDay: Infinity } : { perWindow: 3, windowMinutes: 10, perDay: 10 };

// アドレスを、大文字小文字と前後の空白を整えて、ハッシュにする(他人のアドレスを、そのまま DB に残さない)
export const emailKey = (email: string): string => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function consumeLoginLinkRequest(email: string, limits: LoginLinkLimits = LOGIN_LINK_LIMITS): Promise<{ ok: boolean }> {
  const key = emailKey(email);
  return db.transaction(async (tx) => {
    // 同じアドレスへの要求を、1 つずつ通す(別のアドレスは待たない)。トランザクションの終わりで、自動で外れる
    // 鍵に接頭辞を付けるのは、ほかのロック(ユーザー ID やレポートの鍵)と、同じ値にならないようにするため
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login-link:${key}`}))`);

    const [counts] = await tx
      .select({
        recent: sql<number>`count(*) filter (where ${loginLinkRequests.createdAt} >= now() - make_interval(mins => ${limits.windowMinutes}))`,
        day: sql<number>`count(*) filter (where ${loginLinkRequests.createdAt} >= now() - interval '1 day')`,
      })
      .from(loginLinkRequests)
      .where(eq(loginLinkRequests.emailHash, key));
    if (Number(counts?.recent ?? 0) >= limits.perWindow || Number(counts?.day ?? 0) >= limits.perDay) return { ok: false };

    // 2 日より古い行は、数えないので消す(表が育たないように)
    await tx.delete(loginLinkRequests).where(lt(loginLinkRequests.createdAt, sql`now() - interval '2 days'`));
    await tx.insert(loginLinkRequests).values({ emailHash: key });
    return { ok: true };
  });
}

// Better Auth の before フックから呼ぶ判定。ログインのメールの依頼(/sign-in/magic-link)だけを見て、アドレスの形が違うものは、本来の検証に任せる
export async function isLoginLinkRequestLimited(path: string, body: unknown): Promise<boolean> {
  if (path !== "/sign-in/magic-link") return false;
  const email = typeof body === "object" && body !== null && "email" in body && typeof body.email === "string" ? body.email : null;
  // 形が違う・長すぎるものは、数えず、本来の検証に任せる(メールアドレスは、最大 320 文字。長い文字列を、DB の処理に回さない)
  if (email === null || email.trim() === "" || email.length > MAX_EMAIL_LENGTH) return false;
  return !(await consumeLoginLinkRequest(email)).ok;
}
