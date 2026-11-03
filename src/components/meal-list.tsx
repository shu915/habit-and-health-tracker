import Link from "next/link";
import { buttonClass } from "@/components/button";
import { MealBadge } from "@/components/meal-badge";
import { listMealsOfDay } from "@/lib/meals";

// 日の詳細に出す、その日の食事の一覧(食べた時刻の順)と、1 日の合計、「食事を追加」。行のどこでも、食事を直す画面へ移動する
export async function MealList({ date }: { date: string }) {
  const meals = await listMealsOfDay(date);
  const totalKcal = meals.reduce((total, meal) => total + meal.kcal, 0);

  return (
    <section aria-label="食事" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">食事</h2>
        <Link href={`/days/${date}/meals/new`} className={buttonClass()}>
          食事を追加
        </Link>
      </div>

      {meals.length === 0 ? (
        <p className="text-sm text-zinc-500">この日の食事は、まだ記録されていません。</p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            {meals.map((meal) => (
              // 食事名のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
              <li key={meal.id} className="relative flex items-center gap-3 border-t border-zinc-100 px-4 py-2 text-sm first:border-t-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900">
                {/* 運動(exercise-list.tsx)と、バッジと時刻の列の幅をそろえる */}
                <span className="w-14 shrink-0">
                  <MealBadge time={meal.eatenTime} />
                </span>
                <span className="w-11 shrink-0 tabular-nums text-zinc-500">{meal.eatenTime}</span>
                <Link href={`/days/${date}/meals/${meal.id}/edit`} className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0">
                  {meal.alias ?? meal.dishName}
                </Link>
                <span className="tabular-nums">{meal.kcal} kcal</span>
                <span aria-hidden className="text-zinc-400">
                  ›
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-zinc-500">
            1 日の合計: <span className="tabular-nums text-foreground">{totalKcal} kcal</span>(AI の推定の合計です)
          </p>
        </>
      )}
    </section>
  );
}
