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
    <div className="flex flex-col gap-3 rounded-lg bg-surface-raised p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-muted">栄養の目標との比べ</h3>
        {!finished && <span className="text-xs text-ink-muted">途中(食事が増えると変わります)</span>}
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[19rem_1fr]">
        <MealRadarChart axes={radar.axes} inProgress={!finished} />

        <div className="overflow-x-auto">
        <table className="w-full min-w-[19rem] text-left text-sm">
          <thead className="text-xs text-ink-muted">
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
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-ink-muted">
        {/* 出したままにする: データの欠けの断りと、次にやること。目標の説明は、折りたたむ(「医療上の指示ではない」は、その中に残す) */}
        {(radar.incompleteSalt || radar.incompleteFiber) && <p>* 分からない食事があるため、分かる分だけの合計です。</p>}
        {profile.targetCalories === null && <p>プロフィールで目標カロリーを決めると、カロリー・脂質・糖質の目標が出ます。</p>}
        <details>
          <summary className="cursor-pointer">目標の見方</summary>
          <div className="mt-1.5 flex flex-col gap-1.5 leading-relaxed">
            {radar.allowanceKcal !== null && (
              <p>
                目標となるカロリー {number(radar.allowanceKcal)} kcal = 目標カロリー {number(radar.baseKcal ?? 0)}
                {radar.exerciseKcal > 0 ? ` + この日の追加の運動 ${number(radar.exerciseKcal)}` : "(この日の追加の運動の記録はありません)"}
                (動いた分は、多く食べてよいものとして足しています)。
              </p>
            )}
            {weight.kg === null && exercises.length > 0 && <p>体重が分からない運動は、カロリーの目標に足していません。</p>}
            <p>目標カロリーは、その日に記録したときの値です(過ぎた日は、あとでプロフィールを直しても変わりません)。</p>
            <p>
              薄い帯は、人による差を見込んだ目標の幅で、真ん中が 100% です。国が定める目標(塩分は男性 7.5g・女性 6.5g 未満。食物繊維にも目標量があります)は、実際の食事より厳しめなので、この画面では、現実的な値(日本人の実際の量に近い、塩分 10g・食物繊維 20g)を 100% にしています。一般的な参考値と AI の推定で、医療上の指示ではありません。
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

// 表の「目標」: ゾーンの幅(g や kcal)。下限だけの軸は「以上」、上限だけの軸は「まで」
function targetText(axis: RadarAxis): string {
  if (axis.reference === null) return "-";
  // 表は、細かい小数を出さない: kcal は 10 単位、g は整数に丸める(6.97〜10.03 g ではなく 7〜10 g)
  const at = (percent: number) => {
    const value = ((axis.reference ?? 0) * percent) / 100;
    return number(axis.unit === "kcal" ? Math.round(value / 10) * 10 : Math.round(value));
  };
  if (axis.zoneHigh === null) return `${at(axis.zoneLow)} ${axis.unit} 以上`;
  if (axis.zoneLow === 0) return `${at(axis.zoneHigh)} ${axis.unit} まで`;
  return `${at(axis.zoneLow)}〜${at(axis.zoneHigh)} ${axis.unit}`;
}

function Row({ axis, note, incomplete }: { axis: RadarAxis; note: string | null; incomplete: boolean }) {
  return (
    <tr className="border-t border-line-soft">
      <td className="py-1.5">{axis.label}</td>
      <td className="py-1.5 text-right">
        {number(axis.actual)} {axis.unit}
        {incomplete && <span className="text-ink-muted">*</span>}
      </td>
      <td className="py-1.5 text-right text-ink-muted">{targetText(axis)}</td>
      <td className="py-1.5 text-right">
        {axis.percent === null ? "-" : `${axis.percent}%`}
        {note && <span className="block text-xs text-ink-muted">{note}</span>}
      </td>
    </tr>
  );
}
