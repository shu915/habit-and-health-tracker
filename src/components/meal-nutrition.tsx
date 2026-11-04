import { MealRadarChart } from "@/components/meal-radar-chart";
import { isFinishedDay } from "@/lib/day-result";
import { getDayBasis } from "@/lib/days";
import { exerciseKcal } from "@/lib/exercise";
import { listExercisesOfDay } from "@/lib/exercises";
import { type Meal } from "@/lib/meals";
import { judgement, mealRadar, type RadarAxis } from "@/lib/meal-radar";

// 日の詳細の「食事」の枠に出す、その日の栄養の目標との比べ。左にレーダーチャート、右に数字の表(チャートの読み方と正確な値)。
// 過ぎた日は通常の表示で、一言(多め・少なめなど)も付ける。今日(書きかけ)は、まだ増える値なので、「途中」と示し、一言は付けない。
// 数字は食事の合計の列から計算するだけで、AI は使わない。医療上の指示ではない
const number = (value: number) => value.toLocaleString("ja-JP");

export async function MealNutrition({ date, meals }: { date: string; meals: readonly Meal[] }) {
  if (meals.length === 0) return null;

  const [exercises, { profile, weight }] = await Promise.all([listExercisesOfDay(date), getDayBasis(date)]);
  const finished = isFinishedDay(date);
  // カロリーの目標には、その日の運動の消費を足す(体重が分からず計算できない運動は 0 として足さない)
  const exerciseTotal = exercises.reduce((total, e) => total + (exerciseKcal(e.type, e.intensity, e.minutes, weight.kg) ?? 0), 0);
  const radar = mealRadar({
    meals,
    exerciseKcal: exerciseTotal,
    targetKcal: profile.targetCalories,
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-500">栄養の目標との比べ</h3>
        {!finished && <span className="text-xs text-zinc-500">途中(食事が増えると変わります)</span>}
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[18rem_1fr]">
        <MealRadarChart axes={radar.axes} inProgress={!finished} />

        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-normal">栄養素</th>
              <th className="py-1 text-right font-normal">この日</th>
              <th className="py-1 text-right font-normal">目標</th>
              <th className="py-1 text-right font-normal">割合</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {radar.axes.map((axis) => (
              <Row
                key={axis.key}
                axis={axis}
                note={finished ? judgement(axis) : null}
                incomplete={(axis.key === "salt" && radar.incompleteSalt) || (axis.key === "fiber" && radar.incompleteFiber)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 text-xs text-zinc-500">
        {(radar.incompleteSalt || radar.incompleteFiber) && <p>* 分からない食事があるため、分かる分だけの合計です。</p>}
        {radar.allowanceKcal !== null && (
          <p>
            目標となるカロリー {number(radar.allowanceKcal)} kcal = 目標カロリー {number(radar.baseKcal ?? 0)}
            {radar.exerciseKcal > 0 ? ` + この日の追加の運動 ${number(radar.exerciseKcal)}` : "(この日の追加の運動の記録はありません)"}。
            動いた分は、多く食べてよいものとして足しています。
          </p>
        )}
        {weight.kg === null && exercises.length > 0 && <p>体重が分からない運動は、カロリーの目標に足していません。</p>}
        <p>目標カロリーは、その日に記録したときのプロフィールの値です(今日の分は、プロフィールを直すと変わります。過ぎた日は、あとで直しても変わりません)。</p>
        {profile.targetCalories === null && <p>プロフィールで目標カロリーを決めると、カロリー・脂質・糖質の目標が出ます。</p>}
        <p>
          カロリー以外の目標は、一般的な参考値です(たんぱく質は目標となるカロリーの 20%、脂質は 25%、糖質は 50%、食物繊維は 20g 以上、塩分は 7.5g 未満)。栄養は AI の推定で、医療上の指示ではありません。
        </p>
      </div>
    </div>
  );
}

function Row({ axis, note, incomplete }: { axis: RadarAxis; note: string | null; incomplete: boolean }) {
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-900">
      <td className="py-1.5">{axis.label}</td>
      <td className="py-1.5 text-right">
        {number(axis.actual)} {axis.unit}
        {incomplete && <span className="text-zinc-500">*</span>}
      </td>
      <td className="py-1.5 text-right text-zinc-500">{axis.reference === null ? "-" : `${number(axis.reference)} ${axis.unit}`}</td>
      <td className="py-1.5 text-right">
        {axis.percent === null ? "-" : `${axis.percent}%`}
        {note && <span className="block text-xs text-zinc-500">{note}</span>}
      </td>
    </tr>
  );
}
