import { dayResult, isFinishedDay } from "@/lib/day-result";
import { energyOverview } from "@/lib/energy-overview";
import { listExercisesOfDay } from "@/lib/exercises";
import { listMealsOfDay } from "@/lib/meals";
import { getProfile } from "@/lib/profiles";

// 過ぎた日の結果(摂取と消費の目安、その差)。今日と未来は、まだ記録が増えるので出さない(isFinishedDay)。
// 数字は推定どうしの比べで、保存せず、表示のたびに記録から計算する
const number = (value: number) => value.toLocaleString("ja-JP");
// 差は、符号つきの数字で出す(+120 / −100 / ±0)
const signed = (value: number) => (value === 0 ? "±0" : `${value > 0 ? "+" : "−"}${number(Math.abs(value))}`);

export async function DayResult({ date, morningWeightKg }: { date: string; morningWeightKg: string | null }) {
  if (!isFinishedDay(date)) return null;

  const [meals, exercises, profile] = await Promise.all([listMealsOfDay(date), listExercisesOfDay(date), getProfile()]);
  const weight = morningWeightKg ?? profile.currentWeightKg;
  const result = dayResult({
    meals,
    exercises,
    weightKg: weight === null ? null : Number(weight),
    energy: energyOverview(profile),
    targetProteinG: profile.targetProteinG === null ? null : Number(profile.targetProteinG),
  });

  return (
    <section aria-label="この日の結果" className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-500">この日の結果</h2>

      {result.mealCount === 0 ? (
        <p className="text-sm text-zinc-500">食事の記録がありません。</p>
      ) : (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">摂取</dt>
          <dd>
            <span className="text-xl font-semibold">{number(result.intakeKcal)}</span> kcal
            <span className="text-zinc-500">(記録した食事 {result.mealCount} 回の合計)</span>
          </dd>

          {result.burn && (
            <>
              <dt className="text-zinc-500">消費の目安</dt>
              <dd>
                <span className="text-xl font-semibold">{number(result.burn.totalKcal)}</span> kcal
                <span className="text-zinc-500">
                  (基本 {number(result.burn.tdeeKcal)}
                  {result.burn.exerciseKcal > 0 && ` + 追加の運動 ${number(result.burn.exerciseKcal)}`})
                </span>
              </dd>
            </>
          )}

          {result.diffKcal !== null && (
            <>
              <dt className="text-zinc-500">差</dt>
              <dd>
                <span className="text-xl font-semibold">{signed(result.diffKcal)}</span> kcal
                <span className="text-zinc-500">(摂取 − 消費の目安。{result.diffKcal < 0 ? "消費より少ない" : result.diffKcal > 0 ? "消費より多い" : "同じ"})</span>
              </dd>
            </>
          )}

          <dt className="text-zinc-500">たんぱく質</dt>
          <dd>
            {result.proteinG} g{result.targetProteinG !== null && <span className="text-zinc-500">(目標 {result.targetProteinG} g)</span>}
          </dd>
        </dl>
      )}

      {result.mealCount > 0 && result.burn === null && (
        <p className="text-xs text-zinc-500">消費の目安は、プロフィール(身長・体重・年齢・性別・活動係数)がそろうと出ます。</p>
      )}
      {result.burn?.exerciseUncalculated && (
        <p className="text-xs text-zinc-500">体重が分からない運動は、消費に足していません。</p>
      )}
      <p className="text-xs text-zinc-400">
        推定どうしの目安(誤差は 1 割前後あります)で、医療上の指示ではありません。消費の目安は、今のプロフィールで計算しているので、体重や活動係数を直すと、過去の日の数字も変わります。
      </p>
    </section>
  );
}
