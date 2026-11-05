import "server-only";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiRequests } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { startOfMealDay } from "@/lib/meal-day-sql";

// 食事の AI 推定の回数制限(悪用を防ぐための保険。ふつうの人は、そこまで使わない)。AI を呼ぶ前に consumeAiRequest() を呼び、通ったときだけ呼ぶ。
// 1 日 AI_LIMITS.perDay 回まで(「1 日」は、食事の日と同じ 03:00 区切り。「明日の 3:00 以降に、また使えます」と言える)。文章だけでも、写真つきでも、同じ 1 回。
// 失敗は数えない: 接続・AI のエラー・読めない返事のときは、返された release() で、数えた分を戻す(呼び出し側が呼ぶ)。
// 「食べ物でない」という AI の判定は、費用が出ていて、悪用の入口になるので、数える(戻さない)。
// 残りの回数は、画面に出さない。上限に来たときだけ、メッセージを(赤字で)出す。
// AI レポートは、別の決まり(随時は 1 日 1 回、月次は同じ月 1 回。lib/report-period.ts)で、この回数には数えない。
// 数えるのは DB(ai_requests)なので、サーバーが複数に分かれても効く。時刻の比較は DB の now() で行う。
// 数えて足す処理は、同時に呼ばれても上限を超えないよう、ユーザー単位のロックで直列にする(consumeAiRequest)
export const AI_LIMITS = { perDay: 10 } as const;

export const AI_LIMIT_MESSAGE = `今日の AI の推定は、${AI_LIMITS.perDay} 回までです。明日の 3:00 以降に、また使えます。`;

// ok のとき release は、数えた 1 回分を戻す(失敗のとき)。戻せるのは、その 1 回分だけで、何度呼んでも、二重には戻らない
export type AiLimitResult = { ok: true; release: () => Promise<void> } | { ok: false; message: string };

type Db = Pick<typeof db, "select" | "insert" | "delete">;

async function countToday(executor: Db, userId: string): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(aiRequests)
    .where(and(eq(aiRequests.userId, userId), sql`${aiRequests.createdAt} >= ${startOfMealDay}`));
  return row?.value ?? 0;
}

// 上限内なら 1 回分を記録して ok、超えていれば記録せずに ng。
// 「数える → 足す」を、ユーザー単位のロック(pg_advisory_xact_lock)で直列にする。ロックがないと、AI の呼び出しの間に
// 同時に届いた要求が、すべて「0 件」を見て通り、上限を無視して課金が膨らむ。ロックは、数えて足すまでの短い間だけで、AI の呼び出しは、ロックの外
export async function consumeAiRequest(): Promise<AiLimitResult> {
  const userId = await getCurrentUserId();

  return db.transaction(async (tx): Promise<AiLimitResult> => {
    // 同じユーザーの要求を、1 つずつ通す(別のユーザーは待たない)。トランザクションの終わりで、自動で外れる
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    if ((await countToday(tx, userId)) >= AI_LIMITS.perDay) return { ok: false, message: AI_LIMIT_MESSAGE };

    // 2 日より古い行は、数えないので消す(表が育たないように)
    await tx.delete(aiRequests).where(and(eq(aiRequests.userId, userId), lt(aiRequests.createdAt, sql`now() - interval '2 days'`)));
    const [row] = await tx.insert(aiRequests).values({ userId }).returning({ id: aiRequests.id });
    return {
      ok: true,
      release: async () => {
        await db.delete(aiRequests).where(and(eq(aiRequests.id, row.id), eq(aiRequests.userId, userId))); // その 1 回分だけ(userId でも絞る)
      },
    };
  });
}
