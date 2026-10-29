import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { PROFILE_FIELDS, type ProfileValues } from "@/lib/profile-schema";

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

// ログイン中のユーザーのプロフィールを更新する。渡された項目だけを書く(キーが無い項目は変更しない)。
// 渡す値は parseProfileForm を通ったもの。user_id などの余計なキーは、ここで落とす
export async function updateProfile(values: Partial<ProfileValues>) {
  const userId = await getCurrentUserId();
  await getProfile(); // 行が無ければ作る

  const changes: Partial<ProfileValues> = {};
  for (const field of PROFILE_FIELDS) {
    if (values[field] !== undefined) Object.assign(changes, { [field]: values[field] });
  }
  if (Object.keys(changes).length === 0) return getProfile();

  const [row] = await db.update(profiles).set(changes).where(eq(profiles.userId, userId)).returning();
  if (!row) throw new Error("failed to update the profile");
  return row;
}
