import { dayResult, isFinishedDay } from "@/lib/day-result";
import { energyOverview } from "@/lib/energy-overview";
import { listExercisesOfDay } from "@/lib/exercises";
import { getDayWeight } from "@/lib/days";
import type { DayWeight } from "@/lib/day-weight";
import { listMealsOfDay } from "@/lib/meals";
import { getProfile } from "@/lib/profiles";

// 過ぎた日の結果(摂取と消費の目安、その差)。今日と未来は、まだ記録が増えるので出さない(isFinishedDay)。
// 数字は推定どうしの比べで、保存せず、表示のたびに記録から計算する
const number = (value: number) => value.toLocaleString("ja-JP");
// 差は、符号つきの数字で出す(+120 / −100 / ±0)
const signed = (value: number) => (value === 0 ? "±0" : `${value > 0 ? "+" : "−"}${number(Math.abs(value))}`);

export async function DayResult({ date }: { date: string }) {
  if (!isFinishedDay(date)) return null;

  const [meals, exercises, profile, weight] = await Promise.all([listMealsOfDay(date), listExercisesOfDay(date), getProfile(), getDayWeight(date)]);
  const result = dayResult({
    meals,
    exercises,
    weightKg: weight.kg,
    // 基礎代謝も、その日の体重で計算する(朝の体重 → それ以前の最新 → プロフィールの順)
    energy: energyOverview({ ...profile, currentWeightKg: weight.kg === null ? null : String(weight.kg) }),
    targetProteinG: profile.targetProteinG === null ? null : Number(profile.targetProteinG),
    targetCalories: profile.targetCalories,
  });

  return (
    <section aria-label="この日の結果" className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-medium text-zinc-500">この日の結果</h2>

      {result.mealCount === 0 ? (
        <p className="text-sm text-zinc-500">食事の記録がありません。</p>
      ) : (
        <>
          {/* 数字を横に並べる(狭い画面では 2 列)。説明は数字の下に小さく */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Tile label="摂取" value={number(result.intakeKcal)} unit="kcal" caption={`記録した食事 ${result.mealCount} 回の合計`} />

            {result.target && (
              <Tile
                label="目標となるカロリー"
                value={number(result.target.totalKcal)}
                unit="kcal"
                caption={
                  result.target.exerciseKcal > 0
                    ? `目標カロリー ${number(result.target.baseKcal)} + 追加の運動 ${number(result.target.exerciseKcal)}`
                    : "プロフィールの目標カロリー(追加の運動なし)"
                }
              />
            )}

            {result.burn && (
              <Tile
                label="消費の目安"
                value={number(result.burn.totalKcal)}
                unit="kcal"
                caption={
                  result.burn.exerciseKcal > 0
                    ? `基礎代謝 × 活動係数 ${number(result.burn.tdeeKcal)} + 追加の運動 ${number(result.burn.exerciseKcal)}`
                    : "基礎代謝 × 活動係数(追加の運動なし)"
                }
              />
            )}

            {result.diffKcal !== null && (
              <Tile
                label="差(摂取 − 消費の目安)"
                value={signed(result.diffKcal)}
                unit="kcal"
                caption={`${result.diffKcal < 0 ? "消費より少ない" : result.diffKcal > 0 ? "消費より多い" : "同じ"}(目標とは比べません)`}
              />
            )}
          </dl>

          <p className="text-sm">
            <span className="text-zinc-500">たんぱく質 </span>
            {result.proteinG} g{result.targetProteinG !== null && <span className="text-zinc-500">(目標 {result.targetProteinG} g)</span>}
          </p>
        </>
      )}

      {result.mealCount > 0 && result.burn === null && (
        <p className="text-xs text-zinc-500">消費の目安は、プロフィール(身長・体重・年齢・性別・活動係数)がそろうと出ます。</p>
      )}
      {result.burn?.exerciseUncalculated && (
        <p className="text-xs text-zinc-500">体重が分からない運動は、消費に足していません。</p>
      )}
      <p className="text-xs text-zinc-400">
        推定どうしの目安(誤差は 1 割前後あります)で、医療上の指示ではありません。消費の目安は、{weightNote(weight)}と、今のプロフィールの活動係数で計算しています。活動係数を直すと、過去の日の数字も変わります。
      </p>
    </section>
  );
}

// 結果の1つ分: 小さなラベル、大きな数字、小さな説明
function Tile({ label, value, unit, caption }: { label: string; value: string; unit: string; caption: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd>
        <span className="text-2xl font-semibold tabular-nums">{value}</span> <span className="text-sm text-zinc-500">{unit}</span>
      </dd>
      <dd className="text-xs text-zinc-500">{caption}</dd>
    </div>
  );
}

// 計算に使った体重の出どころ(その日の朝の体重が無いときは、どの日の体重かを示す)
function weightNote(weight: DayWeight): string {
  if (weight.kg === null) return "体重(記録なし)";
  if (weight.source === "morning") return `その日の朝の体重 ${weight.kg} kg`;
  if (weight.source === "earlier") return `体重 ${weight.kg} kg(その日の朝の体重が無いため、${weight.earlierDate} の朝の体重)`;
  return `体重 ${weight.kg} kg(朝の体重の記録が無いため、プロフィールの体重)`;
}
