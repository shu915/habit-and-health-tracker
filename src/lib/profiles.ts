import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

// ログイン中のユーザーのプロフィール。行はユーザー作成時に自動で作られる(auth.ts の databaseHooks)。
// 万一無いとき(フックの失敗や、フックを入れる前にできたユーザー)は、ここで空の行を作る。
// 個人の値(身長・体重・目標など)は、本人が入力・算出するまで null。使う側で null を「未設定」として扱うこと
export async function getProfile() {
  const userId = await getCurrentUserId();
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (existing) return existing;

  await db.insert(profiles).values({ userId }).onConflictDoNothing();
  const [created] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  // 挿入と選択のあいだにユーザーが消えた場合など。型は行のままにして、起きたら気づけるようにする
  if (!created) throw new Error("failed to load or create the profile");
  return created;
}
