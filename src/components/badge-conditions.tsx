import { CALORIE_HIGH_RATIO, CALORIE_LOW_RATIO, SLEEP_MIDPOINT_TOLERANCE_MINUTES, SLEEP_MIN_MINUTES, TIER_RATIOS } from "@/lib/report-badges";

// バッジの条件(折りたたみ)。作る画面(/reports)と、バッジのあるレポートの詳細の両方で使う。
// 片方だけ直して食い違わないよう、文章はここに 1 か所だけ置く。数字は lib/report-badges.ts の定数から出す
export function BadgeConditions() {
  return (
    <details className="text-xs text-ink-muted">
      <summary className="cursor-pointer">バッジの条件</summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-relaxed">
        <li>継続: その期間の日のうち、何か 1 種類でも記録がある日(朝の体重・睡眠、食事、運動、良かったこと、今日の気づきのどれか)。記録を続けると取れます</li>
        <li>睡眠: 睡眠時間が {SLEEP_MIN_MINUTES / 60} 時間以上、かつ、睡眠の中間時刻が、プロフィールの目標の ±{SLEEP_MIDPOINT_TOLERANCE_MINUTES / 60} 時間以内の日</li>
        <li>
          カロリー: 摂取が目標となるカロリーの {Math.round(CALORIE_LOW_RATIO * 100)}〜{Math.round(CALORIE_HIGH_RATIO * 100)}% の日(食事が 1 回だけの日は数えません)
        </li>
        <li>運動: 「いつもより多く動いた」記録のある日が、その週に 1 日以上ある週</li>
        <li>
          収まった(記録した)割合が {Math.round(TIER_RATIOS.bronze * 100)}% 以上でブロンズ、{Math.round(TIER_RATIOS.silver * 100)}% 以上でシルバー、{Math.round(TIER_RATIOS.gold * 100)}% 以上でゴールドです。体重を減らしたことには、バッジを贈りません。一般的な目安で、医療上の指示ではありません。
        </li>
      </ul>
    </details>
  );
}
