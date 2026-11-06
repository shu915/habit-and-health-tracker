import { dayResult, isFinishedDay } from "@/lib/day-result";
import { energyOverview } from "@/lib/energy-overview";
import { listExercisesOfDay } from "@/lib/exercises";
import { getDayBasis } from "@/lib/days";
import type { DayMeasure, DayWeight } from "@/lib/day-weight";
import { listMealsOfDay } from "@/lib/meals";

// 過ぎた日の結果(摂取と消費の目安、その差)。今日と未来は、まだ記録が増えるので出さない(isFinishedDay)。
// 数字は推定どうしの比べで、保存せず、表示のたびに記録から計算する
const number = (value: number) => value.toLocaleString("ja-JP");
// 差は、符号つきの数字で出す(+120 / −100 / ±0)
const signed = (value: number) => (value === 0 ? "±0" : `${value > 0 ? "+" : "−"}${number(Math.abs(value))}`);

export async function DayResult({ date }: { date: string }) {
  if (!isFinishedDay(date)) return null;

  const [meals, exercises, { profile, weight, bodyFat }] = await Promise.all([listMealsOfDay(date), listExercisesOfDay(date), getDayBasis(date)]);
  const result = dayResult({
    meals,
    exercises,
    weightKg: weight.kg,
    // 基礎代謝も、その日の体重・体脂肪率・活動係数で計算する(getDayBasis。過ぎた日を今のプロフィールで書き換えない)
    energy: energyOverview(profile),
  });

  return (
    <section aria-label="この日の結果" className="flex flex-col gap-3 rounded-lg bg-surface-raised p-5">
      <h2 className="text-sm font-bold text-ink-muted">この日の結果</h2>

      {result.mealCount === 0 ? (
        <p className="text-sm text-ink-muted">食事の記録がありません。</p>
      ) : (
        <>
          {/* 実際の収支(食べた − 使った = 差。左から右へ計算の順)。目標との比べは、栄養のレーダー(meal-nutrition.tsx)が担当する */}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile label="摂取" value={number(result.intakeKcal)} unit="kcal" caption={`記録した食事 ${result.mealCount} 回の合計`} />

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
                caption={result.diffKcal < 0 ? "消費より少ない" : result.diffKcal > 0 ? "消費より多い" : "同じ"}
              />
            )}
          </dl>
        </>
      )}

      {result.mealCount > 0 && result.burn === null && (
        <p className="text-xs text-ink-muted">消費の目安は、プロフィール(身長・体重・年齢・性別・活動係数)がそろうと出ます。</p>
      )}
      {result.burn?.exerciseUncalculated && (
        <p className="text-xs text-ink-muted">体重が分からない運動は、消費に足していません。</p>
      )}
      <p className="text-xs text-ink-subtle">
        推定どうしの目安(誤差は 1 割前後あります)で、医療上の指示ではありません。消費の目安は、{weightNote(weight)}{bodyFatNote(bodyFat)}と、その日に記録したときのプロフィールの活動係数で計算しています。過ぎた日は、あとでプロフィールを直しても数字は変わりません。
      </p>
    </section>
  );
}

// 結果の1つ分: 小さなラベル、大きな数字、小さな説明
function Tile({ label, value, unit, caption }: { label: string; value: string; unit: string; caption: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd>
        <span className="text-2xl font-semibold tabular-nums">{value}</span> <span className="text-sm text-ink-muted">{unit}</span>
      </dd>
      <dd className="text-xs text-ink-muted">{caption}</dd>
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

// 体脂肪率の出どころ。基礎代謝の式は、体脂肪率があると除脂肪体重で計算する
function bodyFatNote(bodyFat: DayMeasure): string {
  if (bodyFat.value === null) return "";
  if (bodyFat.source === "morning") return `、その日の朝の体脂肪率 ${bodyFat.value}%`;
  if (bodyFat.source === "earlier") return `、体脂肪率 ${bodyFat.value}%(${bodyFat.earlierDate} の朝の値)`;
  return `、体脂肪率 ${bodyFat.value}%(プロフィールの値)`;
}
