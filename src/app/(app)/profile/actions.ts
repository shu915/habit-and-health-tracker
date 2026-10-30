"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { parseProfileForm, PROFILE_FIELDS, type ProfileField } from "@/lib/profile-schema";
import { updateProfile } from "@/lib/profiles";

// 検証に失敗したとき、フォームに返す状態。入力した値を返して、フォームに残す
export type ProfileFormState = {
  errors: Partial<Record<ProfileField, string>>;
  values: Partial<Record<ProfileField, string>>;
  submittedAt: number; // フォームを作り直す(入力を残したまま初期化されないようにする)ための印
} | null;

export async function saveProfileAction(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  // 最初に認証を確かめる。ログインしていなければ /login へ送られ、検証にも保存にも進まない
  await getCurrentUserId();

  const values: Partial<Record<ProfileField, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const value = formData.get(field);
    if (typeof value === "string") values[field] = value;
  }

  const result = parseProfileForm(values);
  if (!result.ok) return { errors: result.errors, values, submittedAt: Date.now() };

  // フォームに無かった項目は変更されない(result.values には、送られた項目だけが入っている)
  await updateProfile(result.values);

  revalidatePath("/");
  redirect("/");
}
