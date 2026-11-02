"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { isRecordableDate } from "@/lib/date";
import { isExerciseId } from "@/lib/exercise-limits";
import { EXERCISE_FIELDS, parseExerciseForm, type ExerciseField } from "@/lib/exercise-schema";
import { deleteExercise, ExerciseLimitError, getExercise, saveExercise, updateExercise } from "@/lib/exercises";

// 運動の Server Action。どれも、最初に getCurrentUserId() で認証を確かめる(未ログインなら /login へ送られ、何も実行されない)。
// 日付と id は、ページが bind して渡す(フォームの入力としては受け取らない)。念のため、ここでも検証する

// 検証に失敗したとき、フォームに返す状態。入力した値を返して、フォームに残す(day-form と同じ)
export type ExerciseFormState = {
  errors: Partial<Record<ExerciseField, string>>;
  values: Partial<Record<ExerciseField, string>>;
  message?: string; // 欄に結びつかないエラー(その日の件数が上限、など)
  submittedAt: number; // フォームを作り直す(入力を残したまま初期化されないようにする)ための印
} | null;

function readValues(formData: FormData): Partial<Record<ExerciseField, string>> {
  const values: Partial<Record<ExerciseField, string>> = {};
  for (const field of EXERCISE_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

// 運動を追加する。成功したら、その日の詳細へ移動する
export async function saveExerciseAction(date: string, _previous: ExerciseFormState, formData: FormData): Promise<ExerciseFormState> {
  await getCurrentUserId();
  if (!isRecordableDate(date)) notFound();

  const values = readValues(formData);
  const result = parseExerciseForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  try {
    await saveExercise(date, result.values);
  } catch (error) {
    // その日が上限に達している: 保存せず、入力を残したまま理由を出す
    if (error instanceof ExerciseLimitError) return { errors: {}, values, message: error.message, submittedAt: Date.now() };
    throw error;
  }
  revalidatePath("/");
  revalidatePath(`/days/${date}`);
  redirect(`/days/${date}`);
}

// 運動を直す(自分の運動だけ。日は変えない)。成功したら、その日の詳細へ移動する
export async function updateExerciseAction(id: number, _previous: ExerciseFormState, formData: FormData): Promise<ExerciseFormState> {
  await getCurrentUserId();
  if (!isExerciseId(id)) notFound();

  const values = readValues(formData);
  const result = parseExerciseForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  const existing = await getExercise(id); // 自分の運動だけ取れる
  if (!existing) notFound();
  await updateExercise(id, result.values);

  revalidatePath("/");
  revalidatePath(`/days/${existing.date}`);
  redirect(`/days/${existing.date}`);
}

// 運動を消す(自分の運動だけ)。成功したら、その日の詳細へ移動する
export async function deleteExerciseAction(id: number): Promise<void> {
  await getCurrentUserId();
  if (!isExerciseId(id)) notFound();

  const existing = await getExercise(id);
  if (!existing) notFound();
  await deleteExercise(id);

  revalidatePath("/");
  revalidatePath(`/days/${existing.date}`);
  redirect(`/days/${existing.date}`);
}
