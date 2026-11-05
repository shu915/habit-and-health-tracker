import { MealNutrition } from "@/components/meal-nutrition";
import { listMealsOfDay } from "@/lib/meals";

// 日の詳細の、栄養の目標との比べ(レーダーチャートと表)。「この日の結果」の直下に置くため、食事の枠(meal-list.tsx)とは別に、食事を読んで出す。
// 食事が 1 件も無い日は何も出さない
export async function MealNutritionSection({ date }: { date: string }) {
  const meals = await listMealsOfDay(date);
  if (meals.length === 0) return null;
  return <MealNutrition date={date} meals={meals} />;
}
