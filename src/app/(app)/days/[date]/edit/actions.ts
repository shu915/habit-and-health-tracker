"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { isRecordableDate } from "@/lib/date";
import { DAY_FIELDS, parseDayForm, type DayField } from "@/lib/day-schema";
import { saveDay } from "@/lib/days";

// 検証に失敗したとき、フォームに返す状態。入力した値を返して、フォームに残す
export type DayFormState = {
  errors: Partial<Record<DayField, string>>;
  values: Partial<Record<DayField, string>>;
  submittedAt: number; // フォームを作り直す(入力を残したまま初期化されないようにする)ための印
} | null;

// 日付は、編集ページが bind して渡す(フォームの入力としては受け取らない)。念のため、ここでも検証する
export async function saveDayAction(date: string, _previous: DayFormState, formData: FormData): Promise<DayFormState> {
  // 最初に認証を確かめる。ログインしていなければ /login へ送られ、検証にも保存にも進まない
  await getCurrentUserId();
  if (!isRecordableDate(date)) notFound(); // 実在しない日付と、翌日より先の日付

  const values: Partial<Record<DayField, string>> = {};
  for (const field of DAY_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }

  const result = parseDayForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  // フォームに無かった項目は変更されない(result.values には、送られた項目だけが入っている)
  await saveDay(date, result.values);

  revalidatePath("/");
  revalidatePath(`/days/${date}`);
  redirect(`/days/${date}`);
}
