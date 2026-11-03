"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { isRecordableDate } from "@/lib/date";
import { savePositiveEntries } from "@/lib/positive-entries";
import { parsePositiveForm, POSITIVE_FIELDS, type PositiveField } from "@/lib/positive-schema";

// ポジティブ3行日記(良かったこと)の Server Action。最初に getCurrentUserId() で認証を確かめる(未ログインなら /login へ送られ、何も実行されない)。
// 日付は、ページが bind して渡す(フォームの入力としては受け取らない)。念のため、ここでも検証する

// 検証に失敗したとき、フォームに返す状態。入力した値を返して、フォームに残す(day-form と同じ)
export type PositiveFormState = {
  errors: Partial<Record<PositiveField, string>>;
  values: Partial<Record<PositiveField, string>>;
  submittedAt: number; // フォームを作り直す(入力を残したまま初期化されないようにする)ための印
} | null;

// その日の「良かったこと」をまとめて保存する。成功したら、その日の詳細へ移動する
export async function savePositiveAction(date: string, _previous: PositiveFormState, formData: FormData): Promise<PositiveFormState> {
  await getCurrentUserId();
  if (!isRecordableDate(date)) notFound();

  const values: Partial<Record<PositiveField, string>> = {};
  for (const field of POSITIVE_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }

  const result = parsePositiveForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  await savePositiveEntries(date, result.values);
  revalidatePath("/"); // 日記だけの日は、ここで days の行ができる(ダッシュボードの一覧に出る)
  revalidatePath(`/days/${date}`);
  redirect(`/days/${date}`);
}
