import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { days, profiles } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 日の行の「作る」入口。日の行を作る所は、必ずここを通す。
// 初めて作るときだけ、プロフィールの目標カロリー・活動係数を行に写す(あとで目標を直しても、過去の日は当時の値のまま)。
// すでに行があれば何もしない(写しは書き換えない)。呼び出し側のトランザクションの中で呼ぶ
export async function insertDayIfMissing(tx: Tx, userId: string, date: string, changes: Partial<typeof days.$inferInsert> = {}) {
  const [profile] = await tx
    .select({ targetCalories: profiles.targetCalories, activityLevel: profiles.activityLevel })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return tx
    .insert(days)
    .values({
      ...changes,
      userId,
      date,
      profileTargetCalories: profile?.targetCalories ?? null,
      profileActivityLevel: profile?.activityLevel ?? null,
    })
    .onConflictDoNothing({ target: [days.userId, days.date] });
}
