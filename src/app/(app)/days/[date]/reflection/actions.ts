"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { getCurrentUserId } from "@/lib/current-user";
import { isRecordableDate } from "@/lib/date";
import { parseDayForm } from "@/lib/day-schema";
import { saveDay } from "@/lib/days";

// 夜の振り返りだけを保存する Server Action。朝の記録(edit/actions.ts)と同じ saveDay を使い、reflection だけを渡すので、ほかの項目は変わらない。
// 日付は、ページが bind して渡す(フォームの入力としては受け取らない)。念のため、ここでも検証する
export async function saveReflectionAction(date: string, _previous: DayFormState, formData: FormData): Promise<DayFormState> {
  // 最初に認証を確かめる。ログインしていなければ /login へ送られ、検証にも保存にも進まない
  await getCurrentUserId();
  if (!isRecordableDate(date)) notFound();

  // この Action は振り返り専用。キーが無いときは空欄として扱う(保存すると消える。画面のフォームは必ず送る)
  const reflection = formData.get("reflection");
  const values = { reflection: typeof reflection === "string" ? reflection : "" };

  const result = parseDayForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  await saveDay(date, { reflection: result.values.reflection });

  revalidatePath("/");
  revalidatePath(`/days/${date}`);
  redirect(`/days/${date}`);
}
