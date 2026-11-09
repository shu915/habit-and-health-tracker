import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConsents, monthThemes } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { AI_CONSENT_VERSION } from "@/lib/report-consent-text";

// AI フィードバック(レポート)への同意(docs/ai-feedback.md)。最初の 1 回だけチェックを入れてもらい、2 回目からは、その同意に付随する。
// 1 人 1 行(ai_consents。プロフィールではなく、AI の側に持つ)。同意した文面のバージョンが、今のバージョンより古ければ、また聞く(文面を変えたとき)。
// 撤回は、行を消す(未同意に戻る)。日記から AI が作った、月ごとのテーマ(month_themes。短いラベル)も、一緒に消す(撤回したあとに、残さない)。作ったレポートは、残る
export type AiConsent = { consented: boolean; version: number | null; at: Date | null };

export function isConsentCurrent(version: number | null): boolean {
  return version !== null && version >= AI_CONSENT_VERSION;
}

export async function getAiConsent(): Promise<AiConsent> {
  const userId = await getCurrentUserId();
  const [row] = await db.select().from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
  return { consented: isConsentCurrent(row?.version ?? null), version: row?.version ?? null, at: row?.consentedAt ?? null };
}

export async function grantAiConsent(): Promise<void> {
  const userId = await getCurrentUserId();
  await db
    .insert(aiConsents)
    .values({ userId, version: AI_CONSENT_VERSION })
    .onConflictDoUpdate({ target: aiConsents.userId, set: { version: AI_CONSENT_VERSION, consentedAt: new Date() } });
}

export async function revokeAiConsent(): Promise<void> {
  const userId = await getCurrentUserId();
  await db.transaction(async (tx) => {
    await tx.delete(aiConsents).where(eq(aiConsents.userId, userId));
    await tx.delete(monthThemes).where(eq(monthThemes.userId, userId));
  });
}
