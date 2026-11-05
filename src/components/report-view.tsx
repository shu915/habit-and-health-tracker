import { CalorieBalanceCard } from "@/components/calorie-balance-card";
import { CalorieCard } from "@/components/calorie-card";
import { SleepCard } from "@/components/sleep-card";
import { TrendCard } from "@/components/trend-card";
import { BADGE_TIER_LABELS, BADGE_LABELS, CALORIE_HIGH_RATIO, CALORIE_LOW_RATIO, SLEEP_MIDPOINT_TOLERANCE_MINUTES, SLEEP_MIN_MINUTES, TIER_RATIOS, type Badge, type BadgeTier } from "@/lib/report-badges";
import { SECTION_KEYS, SECTION_LABELS, type Finding, type ReportContent, type SectionKey } from "@/lib/report-content";
import { badgeDetail, reportTitle, shortDate } from "@/lib/report-format";
import type { StoredReport } from "@/lib/reports";
import { buildTrendViews } from "@/lib/trend-views";

// レポートの表示(docs/ai-feedback.md)。保存した「作った時点の元の数字」から、グラフを描き直し(buildTrendViews)、AI の文章とマージして並べる。
// 項目ごとに「グラフ → AI の気づき」、最後に総合評価。評価(成績・点数)は出さず、取れたバッジだけを先頭に出す。
// 注目日付は、グラフに点線の印を引き、文章にも日付を書く(色だけに頼らない)。AI の分析は目安で、医療上の指示ではない
const TIER_COLORS: Record<BadgeTier, string> = { bronze: "#b87333", silver: "#9ca3af", gold: "#d4a017" };

function DateChips({ dates }: { dates: readonly string[] }) {
  if (dates.length === 0) return null;
  return <p className="mt-0.5 text-xs text-zinc-500">注目の日: {dates.map(shortDate).join("、")}</p>;
}

function Findings({ findings }: { findings: readonly Finding[] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {findings.map((finding, i) => (
        <li key={i}>
          <p>{finding.text}</p>
          <DateChips dates={finding.dates} />
        </li>
      ))}
    </ul>
  );
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <span aria-hidden className="inline-block h-4 w-4 rounded-full" style={{ background: TIER_COLORS[badge.tier] }} />
      <span>
        <span className="font-medium">
          {BADGE_LABELS[badge.key]} {BADGE_TIER_LABELS[badge.tier]}
        </span>
        <span className="block text-xs text-zinc-500">{badgeDetail(badge)}が範囲に収まりました</span>
      </span>
    </li>
  );
}

function Charts({ sectionKey, report, highlightDates }: { sectionKey: SectionKey; report: StoredReport; highlightDates: string[] }) {
  if (!report.snapshot) return <p className="text-xs text-zinc-500">グラフの元の数字が読めないため、グラフは出せません。</p>;
  const views = buildTrendViews(report.snapshot);
  const syncId = `report-${sectionKey}`;
  if (sectionKey === "sleep") return <SleepCard points={views.sleep} syncId={syncId} highlightDates={highlightDates} />;
  if (sectionKey === "body") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TrendCard title="体重" unit="kg" digits={2} points={views.weight} syncId={syncId} highlightDates={highlightDates} />
        <TrendCard title="体脂肪率" unit="%" digits={1} points={views.bodyFat} syncId={syncId} highlightDates={highlightDates} />
      </div>
    );
  }
  if (sectionKey === "nutrition") {
    return (
      <div className="flex flex-col gap-4">
        <CalorieCard points={views.calories} syncId={syncId} highlightDates={highlightDates} />
        <CalorieBalanceCard points={views.calories} syncId={syncId} highlightDates={highlightDates} />
      </div>
    );
  }
  if (sectionKey === "exercise") {
    const days = [...new Set(report.snapshot.exercises.map((e) => e.date))].sort();
    return <p className="text-sm text-zinc-500">{days.length === 0 ? "いつもより多く動いた記録は、この期間にありませんでした。" : `いつもより多く動いた日: ${days.map(shortDate).join("、")}`}</p>;
  }
  return null; // 気持ち・日記と記録の習慣は、グラフなし
}

function Overall({ overall }: { overall: ReportContent["overall"] }) {
  return (
    <section aria-label="総合評価" className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">総合評価</h2>
      <p className="text-base leading-relaxed">{overall.summary}</p>

      {overall.good_points.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">良かったこと</h3>
          <ul className="mt-1 list-disc pl-5">
            {overall.good_points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {overall.watch_points.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">気づいておきたいこと</h3>
          <ul className="mt-1 list-disc pl-5">
            {overall.watch_points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {overall.discoveries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">見つかったこと</h3>
          <ul className="mt-1 flex flex-col gap-3">
            {overall.discoveries.map((d, i) => (
              <li key={i}>
                <p className="font-medium">{d.title}</p>
                <p>{d.text}</p>
                <DateChips dates={d.dates} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {overall.next_steps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">次の 1 歩</h3>
          <ol className="mt-1 flex list-decimal flex-col gap-2 pl-5">
            {overall.next_steps.map((step, i) => (
              <li key={i}>
                {step.text}
                {step.sections.length > 0 && (
                  <span className="ml-2 text-xs">
                    {step.sections.map((key) => (
                      <a key={key} href={`#section-${key}`} className="mr-1 rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {SECTION_LABELS[key]}
                      </a>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function ReportView({ report }: { report: StoredReport }) {
  const content = report.content;
  const sections = content ? SECTION_KEYS.flatMap((key) => content.sections.filter((s) => s.key === key)) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{reportTitle(report.kind, report.periodStart, report.periodEnd)}</h1>
        <p className="mt-1 text-sm text-zinc-500">{report.createdAt.toLocaleDateString("ja-JP")} に作成 ・ AI の分析は目安で、医療上の指示ではありません。</p>
      </div>

      <section aria-label="今期のバッジ" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">今期のバッジ</h2>
        {report.badges.length === 0 ? (
          <p className="text-sm text-zinc-500">今期は、バッジの条件に届いた項目はありませんでした。</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {report.badges.map((badge) => (
              <BadgeChip key={badge.key} badge={badge} />
            ))}
          </ul>
        )}
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">バッジの条件</summary>
          <ul className="mt-1 list-disc pl-5">
            <li>睡眠: 睡眠時間が {SLEEP_MIN_MINUTES / 60} 時間以上、かつ、睡眠の中間時刻が、プロフィールの目標の ±{SLEEP_MIDPOINT_TOLERANCE_MINUTES / 60} 時間以内の日</li>
            <li>
              カロリー: 摂取が目標となるカロリーの {Math.round(CALORIE_LOW_RATIO * 100)}〜{Math.round(CALORIE_HIGH_RATIO * 100)}% の日(食事が 1 回だけの日は数えません)
            </li>
            <li>運動: 「いつもより多く動いた」記録のある日が、その週に 1 日以上ある週</li>
            <li>
              収まった割合が {Math.round(TIER_RATIOS.bronze * 100)}% 以上でブロンズ、{Math.round(TIER_RATIOS.silver * 100)}% 以上でシルバー、{Math.round(TIER_RATIOS.gold * 100)}% 以上でゴールドです。体重を減らしたことには、バッジを贈りません。一般的な目安で、医療上の指示ではありません。
            </li>
          </ul>
        </details>
      </section>

      {content === null && <p className="text-sm text-zinc-500">レポートの文章を読み込めませんでした。</p>}

      {sections.map((section) => {
        const highlightDates = [...new Set(section.findings.flatMap((f) => f.dates))].sort();
        return (
          <section key={section.key} id={`section-${section.key}`} aria-label={SECTION_LABELS[section.key]} className="flex scroll-mt-4 flex-col gap-3">
            <h2 className="text-lg font-semibold">{SECTION_LABELS[section.key]}</h2>
            <p className="font-medium">{section.headline}</p>
            <Charts sectionKey={section.key} report={report} highlightDates={highlightDates} />
            <Findings findings={section.findings} />
          </section>
        );
      })}

      {content && <Overall overall={content.overall} />}
    </div>
  );
}
