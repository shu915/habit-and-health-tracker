import "server-only";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiRequests } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

// AI を呼ぶ回数の制限(課金が膨らむのを防ぐ)。AI を呼ぶ前に consumeAiRequest() を呼び、通ったときだけ呼ぶ。
// 数えるのは DB(ai_requests)なので、サーバーが複数に分かれても効く。再推定も 1 回に数える。
// 時刻の比較は DB の now() で行う(アプリと DB のタイムゾーンの違いに左右されない)。
// 数えて足す処理は、同時に呼ばれても上限を超えないよう、ユーザー単位のロックで直列にする(consumeAiRequest)
export const AI_LIMITS = { perHour: 20, perDay: 60 } as const;

export const AI_LIMIT_MESSAGE = "AI の利用回数の上限に達しました。しばらくしてから、もう一度試してください。";

export type AiLimitResult = { ok: true } | { ok: false; message: string };

type Db = Pick<typeof db, "select" | "insert" | "delete">;

async function countSince(executor: Db, userId: string, interval: string): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(aiRequests)
    .where(and(eq(aiRequests.userId, userId), sql`${aiRequests.createdAt} > now() - ${interval}::interval`));
  return row?.value ?? 0;
}

// 上限内なら 1 回分を記録して ok、超えていれば記録せずに ng。
// 「数える → 足す」を、ユーザー単位のロック(pg_advisory_xact_lock)で直列にする。ロックがないと、AI の呼び出し(最大 約 70 秒: 35 秒 × 2 回)の間に
// 同時に届いた要求が、すべて「0 件」を見て通り、上限を無視して課金が膨らむ。ロックは、数えて足すまでの短い間だけで、AI の呼び出しは、ロックの外
export async function consumeAiRequest(): Promise<AiLimitResult> {
  const userId = await getCurrentUserId();

  return db.transaction(async (tx) => {
    // 同じユーザーの要求を、1 つずつ通す(別のユーザーは待たない)。トランザクションの終わりで、自動で外れる
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    if ((await countSince(tx, userId, "1 hour")) >= AI_LIMITS.perHour) return { ok: false, message: AI_LIMIT_MESSAGE };
    if ((await countSince(tx, userId, "1 day")) >= AI_LIMITS.perDay) return { ok: false, message: AI_LIMIT_MESSAGE };

    // 2 日より古い行は、数えないので消す(表が育たないように)
    await tx.delete(aiRequests).where(and(eq(aiRequests.userId, userId), lt(aiRequests.createdAt, sql`now() - interval '2 days'`)));
    await tx.insert(aiRequests).values({ userId });
    return { ok: true };
  });
}
