"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { consumeAiRequest } from "@/lib/ai-limit";
import { getCurrentUserId } from "@/lib/current-user";
import { requireRecordingProfile } from "@/lib/recording-gate";
import { isRecordableDate } from "@/lib/date";
import { checkEstimateInput, estimateMeal } from "@/lib/estimate-meal";
import { buildEstimate, type ParseResult } from "@/lib/meal-estimate";
import { isMealId } from "@/lib/meal-limits";
import { parseMealSave, type MealSaveErrors } from "@/lib/meal-schema";
import { deleteMeal, getMeal, listRecentDishNames, saveMeal, updateMeal, type MealInput } from "@/lib/meals";

// 食事の Server Action。どれも、最初に getCurrentUserId() で認証を確かめる(未ログインなら /login へ送られ、何も実行されない)。
// 届く値は誰でも送れるので、unknown として受け、zod で検証する

const estimateInputSchema = z.object({ text: z.string(), imageDataUrls: z.array(z.string()).optional() });

// AI で推定する(何も保存しない)。順序: 認証 → 入力の検証 → 回数の制限 → 過去の料理名 → AI
export async function estimateMealAction(raw: unknown): Promise<ParseResult> {
  await getCurrentUserId();

  const parsed = estimateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "入力を確認してください。" };
  const checked = checkEstimateInput(parsed.data);
  if (!checked.ok) return checked; // 不正な入力は、回数を数える前に弾く

  const limit = await consumeAiRequest();
  if (!limit.ok) return limit;

  const knownDishNames = await listRecentDishNames(100);
  return estimateMeal({ text: checked.text, imageDataUrls: checked.imageDataUrls, knownDishNames });
}

export type SaveMealResult = { ok: false; errors: MealSaveErrors };

// 画面から届いた値を検証し、合計をコードで計算し直して、保存に渡せる形にする
function toMealInput(raw: unknown): { ok: true; input: MealInput } | SaveMealResult {
  const parsed = parseMealSave(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const built = buildEstimate(parsed.values.estimate); // 届いた合計は使わず、内訳から計算し直す
  if (!built.ok) return { ok: false, errors: { form: built.message } };

  const { estimate } = built;
  return {
    ok: true,
    input: {
      eatenTime: parsed.values.eatenTime,
      dishName: estimate.dishName,
      alias: parsed.values.alias,
      description: estimate.description,
      items: estimate.items,
      totals: estimate.totals,
    },
  };
}

// 食事を追加する。日付は、画面が bind して渡す(念のため、ここでも検証する)。成功したら、その日の詳細へ移動する
export async function saveMealAction(date: string, raw: unknown): Promise<SaveMealResult> {
  await getCurrentUserId();
  if (!isRecordableDate(date)) notFound();
  await requireRecordingProfile(date); // 日の行が無く、未設定なら、プロフィールの編集へ

  const result = toMealInput(raw);
  if (!result.ok) return result;

  await saveMeal(date, result.input);
  revalidatePath("/");
  revalidatePath(`/days/${date}`);
  redirect(`/days/${date}`);
}

// 食事を直す(自分の食事だけ)。成功したら、その日の詳細へ移動する
export async function updateMealAction(id: number, raw: unknown): Promise<SaveMealResult> {
  await getCurrentUserId();
  if (!isMealId(id)) notFound();

  const result = toMealInput(raw);
  if (!result.ok) return result;

  const existing = await getMeal(id); // 自分の食事だけ取れる
  if (!existing) notFound();
  await updateMeal(id, result.input);

  revalidatePath("/");
  revalidatePath(`/days/${existing.date}`);
  redirect(`/days/${existing.date}`);
}

// 食事を消す(自分の食事だけ)。成功したら、その日の詳細へ移動する
export async function deleteMealAction(id: number): Promise<void> {
  await getCurrentUserId();
  if (!isMealId(id)) notFound();

  const existing = await getMeal(id);
  if (!existing) notFound();
  await deleteMeal(id);

  revalidatePath("/");
  revalidatePath(`/days/${existing.date}`);
  redirect(`/days/${existing.date}`);
}
