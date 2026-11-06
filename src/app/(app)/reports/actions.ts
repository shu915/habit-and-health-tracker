"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { createReport } from "@/lib/report-generate";
import { revokeAiConsent } from "@/lib/report-consent";
import { isReportKind } from "@/lib/report-period";

// レポートの作成(docs/ai-feedback.md)。種類と同意のチェックは、フォームの入力として受け取り、検証は lib/report-generate.ts で行う。
// 「作成中」の行を保存して、すぐ返す(AI の呼び出しは、返事を返したあと、after で裏に続ける)。画面は動かさず、/reports に留まる(待たせない。一覧の「作成中」が、できたら切り替わる)。
// 同じ種類(月次は、同じ月)が作成中・その月が作成済みなら、作らず、その旨のメッセージを返す。失敗(同意なし・記録不足・今日はもう作った)も、メッセージを返す
export type ReportFormState = { message: string } | null;

export async function createReportAction(_previous: ReportFormState, formData: FormData): Promise<ReportFormState> {
  await getCurrentUserId(); // 最初に認証を確かめる(未ログインなら /login へ)
  const kind = formData.get("kind");
  if (!isReportKind(kind)) return { message: "作るレポートの種類を選んでください。" };

  const month = formData.get("month");
  const result = await createReport(kind, { consent: formData.get("consent") === "on", month: typeof month === "string" ? month : undefined }, { schedule: (task) => after(task) });
  revalidatePath("/reports"); // 成功なら「作成中」の行が増え、「すでにある」なら、最新の状態に更新される
  return result.ok ? null : { message: result.message };
}

// 同意の撤回(次に作るときは、また最初の 1 回と同じ画面になる)
export async function revokeConsentAction(): Promise<void> {
  await getCurrentUserId();
  await revokeAiConsent();
  revalidatePath("/reports");
}
