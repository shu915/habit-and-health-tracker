import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiConsents, monthThemes } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { isConsentCurrent } from "@/lib/report-consent";
import { extractMonthThemes, hasDiaryText, sanitizeMonthThemes, type DiaryOfMonth, type MonthThemes } from "@/lib/month-themes-ai";

// 月ごとの日記のテーマの、保存と読み出し(docs/ai-feedback.md)。ログイン中のユーザーの分だけ(全部 user_id で絞る)。
// 保存するのは、短いラベルだけ(日記の文章は、複製しない)。月は "YYYY-MM"。DB には、月の 1 日(month_start)で入れる

const monthStartOf = (month: string): string => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`invalid month: ${month}`);
  return `${month}-01`;
};

// 保存済みのテーマを、月ごとに読む(月 → テーマ。まだ無い月は入らない)。読み戻すときも、形を確かめる(形が合わなければ、無いものとして扱う)
export async function loadMonthThemes(months: readonly string[]): Promise<Map<string, MonthThemes>> {
  const userId = await getCurrentUserId();
  const starts = months.map(monthStartOf);
  if (starts.length === 0) return new Map();
  const rows = await db
    .select({ monthStart: monthThemes.monthStart, themes: monthThemes.themes })
    .from(monthThemes)
    .where(and(eq(monthThemes.userId, userId), inArray(monthThemes.monthStart, starts)));
  return new Map(rows.flatMap((row) => {
    const themes = sanitizeMonthThemes(row.themes);
    return themes === null ? [] : [[row.monthStart.slice(0, 7), themes] as [string, MonthThemes]];
  }));
}

// 保存する(同じ月は上書き)。**裏の処理専用**: cookie が読めないので、userId を引数で受け取る(reports.ts の failReport と同じ方式)。
// userId には、呼び出し元が認証して確かめた値だけを渡す(画面からの入力を、そのまま渡さない)。認証を自分でする版は、loadMonthThemes
// **同意の行がある間だけ**入る(撤回と競合しても、撤回のあとに、テーマが残らない。AI の呼び出し中に、利用者が撤回できるため)。入れたら true、入れなかったら false
export async function saveMonthThemes(userId: string, month: string, themes: MonthThemes, consentVersion: number): Promise<boolean> {
  const value = sanitizeMonthThemes(themes);
  if (value === null) throw new Error("invalid themes");
  const result = await db.execute(sql`
    INSERT INTO month_themes (user_id, month_start, themes, consent_version)
    SELECT ${userId}, ${monthStartOf(month)}::date, ${JSON.stringify(value)}::jsonb, ${consentVersion}
    WHERE EXISTS (SELECT 1 FROM ai_consents WHERE user_id = ${userId})
    ON CONFLICT (user_id, month_start) DO UPDATE SET themes = EXCLUDED.themes, consent_version = EXCLUDED.consent_version, created_at = now()`);
  return (result.rowCount ?? 0) > 0;
}

const CONCURRENCY = 3;

// 日記のある月のうち、まだテーマが無い月の分だけ、AI で作って保存する(あとは使い回す)。失敗した月は飛ばして進める(failed に入れる)。
// **裏の処理専用**(saveMonthThemes と同じ理由で、userId を引数で受け取る。認証して確かめた値だけを渡す)。
// **同意の確認は、ここでする**: そのユーザーが、今の文面に同意していなければ、AI を呼ばず、何もせずに返す(consented: false)。日記の全文を送る関数なので、呼び出し元の確認に任せない。
// existing は、保存済みの分(呼び出し元が loadMonthThemes で読んだもの)。日記の無い月は、AI を呼ばず、行も作らない。
// 前提(呼び出し元が守る): 渡す月は、**終わった月だけ**(一度作ったテーマは、日記を書き足しても、作り直さない)。同じユーザーの同時の実行は、呼び出し元の「作成中」の仕組みで防ぐ(二重に呼ぶと、AI の費用が二重になる)。
// 戻り値は、保存済み + 今作った分
export async function ensureMonthThemes(args: {
  userId: string;
  diaries: readonly DiaryOfMonth[];
  existing: ReadonlyMap<string, MonthThemes>;
  complete?: Parameters<typeof extractMonthThemes>[1];
}): Promise<{ themes: Map<string, MonthThemes>; failed: string[]; consented: boolean }> {
  const { userId, diaries, existing, complete } = args;
  const themes = new Map(existing);

  const [consent] = await db.select({ version: aiConsents.version }).from(aiConsents).where(eq(aiConsents.userId, userId)).limit(1);
  if (consent === undefined || !isConsentCurrent(consent.version)) return { themes, failed: [], consented: false };

  const failed: string[] = [];
  const todo = diaries.filter((diary) => hasDiaryText(diary) && !existing.has(diary.month));

  // 数か月を、少しずつ並行して作る(12 か月でも、待ち時間が長くなりすぎないように)
  let next = 0;
  let withdrawn = false;
  const worker = async () => {
    while (next < todo.length && !withdrawn) {
      const diary = todo[next++];
      const result = await extractMonthThemes(diary, complete);
      if (!result.ok) {
        failed.push(diary.month);
        continue;
      }
      const saved = await saveMonthThemes(userId, diary.month, result.themes, consent.version);
      if (!saved) {
        withdrawn = true; // 作っている間に、同意が撤回された。残りの月は、作らない
        return;
      }
      themes.set(diary.month, result.themes);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return { themes, failed: failed.sort(), consented: !withdrawn };
}
