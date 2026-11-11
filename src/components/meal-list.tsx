import Link from "next/link";
import { buttonClass } from "@/components/button";
import { MealBadge } from "@/components/meal-badge";
import { MEAL_MAX_PER_DAY } from "@/lib/meal-limits";
import { listMealsOfDay } from "@/lib/meals";

// 日の詳細に出す、その日の食事の一覧(食べた時刻の順)と、1 日の合計、「食事を追加」。栄養の目標との比べは、別の部品(meal-nutrition-section.tsx)で、日の詳細の「この日の結果」の直下に出す。行のどこでも、食事を直す画面へ移動する
export async function MealList({ date }: { date: string }) {
  const meals = await listMealsOfDay(date);
  const totalKcal = meals.reduce((total, meal) => total + meal.kcal, 0);

  return (
    <section aria-label="食事" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">食事</h2>
        {meals.length >= MEAL_MAX_PER_DAY ? (
          <p className="text-sm text-ink-muted">1 日に記録できるのは {MEAL_MAX_PER_DAY} 件までです</p>
        ) : (
          <Link href={`/days/${date}/meals/new`} className={buttonClass()}>
            食事を追加
          </Link>
        )}
      </div>

      {meals.length === 0 ? (
        <p className="text-sm text-ink-muted">この日の食事は、まだ記録されていません。</p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-lg bg-surface-raised">
            {meals.map((meal) => (
              // 食事名のリンクを行全体に広げる(after:absolute after:inset-0)ので、行のどこをクリックしても移動できる
              <li key={meal.id} className="relative flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line-soft px-5 py-3.5 text-[15px] first:border-t-0 hover:bg-surface-hover sm:flex-nowrap">
                {/* 運動(exercise-list.tsx)と、バッジと時刻の列の幅をそろえる */}
                <span className="w-14 shrink-0">
                  <MealBadge time={meal.eatenTime} />
                </span>
                <span className="w-11 shrink-0 tabular-nums text-ink-muted">{meal.eatenTime}</span>
                <Link href={`/days/${date}/meals/${meal.id}/edit`} className="order-last w-full min-w-0 truncate font-medium after:absolute after:inset-0 sm:order-none sm:w-auto sm:flex-1">
                  {meal.dishName}
                </Link>
                <span className="ml-auto tabular-nums sm:ml-0">{meal.kcal} kcal</span>
                <span aria-hidden className="text-ink-decor">
                  ›
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            1 日の合計: <span className="font-semibold tabular-nums text-foreground">{totalKcal} kcal</span>(AI の推定の合計です)
          </p>
        </>
      )}
    </section>
  );
}
