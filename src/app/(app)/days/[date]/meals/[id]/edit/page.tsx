import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/back-link";
import { MealForm } from "@/components/meal-form";
import { isRecordableDate } from "@/lib/date";
import { isMealId } from "@/lib/meal-limits";
import type { MealEstimate } from "@/lib/meal-estimate";
import { getMeal } from "@/lib/meals";

// 食事を直す・消す。保存した内容から始めて、説明を直して推定し直すか、時刻・別名を直す
export default function EditMealPage({ params }: PageProps<"/days/[date]/meals/[id]/edit">) {
  return (
    <Suspense fallback={<p className="text-zinc-500">読み込み中...</p>}>
      <EditMealContent params={params} />
    </Suspense>
  );
}

async function EditMealContent({ params }: Pick<PageProps<"/days/[date]/meals/[id]/edit">, "params">) {
  const { date, id } = await params;
  await connection();
  const mealId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!isRecordableDate(date) || !isMealId(mealId)) notFound();

  const found = await getMeal(mealId); // 自分の食事だけ取れる
  if (!found || found.date !== date) notFound();
  const { meal } = found;

  // DB の値(numeric は文字列)を、推定の形(数値)にする
  const estimate: MealEstimate = {
    dishName: meal.dishName,
    description: meal.description ?? "",
    items: meal.items,
    totals: {
      kcal: meal.kcal,
      proteinG: Number(meal.proteinG),
      fatG: Number(meal.fatG),
      netCarbG: Number(meal.netCarbG),
      fiberG: meal.fiberG === null ? null : Number(meal.fiberG),
      saltG: meal.saltG === null ? null : Number(meal.saltG),
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href={`/days/${date}`}>{date} の詳細に戻る</BackLink>
        <h1 className="text-2xl font-semibold">{date} の食事を直す</h1>
      </div>
      {!meal.itemsValid && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          保存されている内訳が読み取れませんでした。説明を確認して、推定し直してください。
        </p>
      )}
      <MealForm date={date} mode="edit" mealId={meal.id} initial={{ eatenTime: meal.eatenTime, alias: meal.alias ?? "", estimate }} />
    </div>
  );
}
