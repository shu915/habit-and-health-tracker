import { BadgeConditions } from "@/components/badge-conditions";
import { CalorieBalanceCard } from "@/components/calorie-balance-card";
import { CalorieCard } from "@/components/calorie-card";
import { SleepCard } from "@/components/sleep-card";
import { TrendCard } from "@/components/trend-card";
import { BADGE_TIER_LABELS, BADGE_LABELS, type Badge, type BadgeTier } from "@/lib/report-badges";
import { SECTION_KEYS, SECTION_LABELS, type Finding, type ReportContent, type SectionKey } from "@/lib/report-content";
import { badgeDetail, reportTitle, shortDate } from "@/lib/report-format";
import type { StoredReport } from "@/lib/reports";
import { buildTrendViews } from "@/lib/trend-views";

// レポートの表示(docs/ai-feedback.md)。保存した「作った時点の元の数字」から、グラフを描き直し(buildTrendViews)、AI の文章とマージして並べる。
// 並びは、取れたバッジ → 総合評価(結論を先に) → 項目ごとに「グラフ → AI の気づき」。評価(成績・点数)は出さず、取れたバッジだけを先頭に出す。
// 注目日付は、グラフに点線の印を引き、文章にも日付を書く(色だけに頼らない)。AI の分析は目安で、医療上の指示ではない
const TIER_COLORS: Record<BadgeTier, string> = { bronze: "#b87333", silver: "#9ca3af", gold: "#d4a017" };

function DateChips({ dates }: { dates: readonly string[] }) {
  if (dates.length === 0) return null;
  return <p className="mt-0.5 text-xs text-ink-muted">注目の日: {dates.map(shortDate).join("、")}</p>;
}

function Findings({ findings }: { findings: readonly Finding[] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3 text-[15px] leading-[1.8]">
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
    <li className="flex items-center gap-3 rounded-lg bg-surface-raised px-4.5 py-3.5">
      <span aria-hidden className="inline-block h-5 w-5 shrink-0 rounded-sm" style={{ background: TIER_COLORS[badge.tier] }} />
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">
          {BADGE_LABELS[badge.key]} {BADGE_TIER_LABELS[badge.tier]}
        </span>
        <span className="text-xs text-ink-muted">{badgeDetail(badge)}が範囲に収まりました</span>
      </span>
    </li>
  );
}

function Charts({ sectionKey, report, highlightDates }: { sectionKey: SectionKey; report: StoredReport; highlightDates: string[] }) {
  if (!report.snapshot) return <p className="text-xs text-ink-muted">グラフの元の数字が読めないため、グラフは出せません。</p>;
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
    return <p className="text-sm text-ink-muted">{days.length === 0 ? "いつもより多く動いた記録は、この期間にありませんでした。" : `いつもより多く動いた日: ${days.map(shortDate).join("、")}`}</p>;
  }
  return null; // 気持ち・日記と記録の習慣は、グラフなし
}

function Overall({ overall }: { overall: ReportContent["overall"] }) {
  return (
    <section aria-label="総合評価" className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">総合評価</h2>
      <div className="flex flex-col gap-5 rounded-lg bg-surface-raised p-4 text-[15px] sm:p-6 leading-[1.8] [&>div]:border-t [&>div]:border-line-soft [&>div]:pt-4.5">
      <p className="text-base font-semibold text-pretty sm:text-[17px]">{overall.summary}</p>

      {overall.good_points.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-ink-muted">良かったこと</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {overall.good_points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {overall.watch_points.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-ink-muted">気づいておきたいこと</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {overall.watch_points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {overall.discoveries.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-ink-muted">見つかったこと</h3>
          <ul className="mt-2 flex flex-col gap-4">
            {overall.discoveries.map((d, i) => (
              <li key={i}>
                <p className="font-bold">{d.title}</p>
                <p>{d.text}</p>
                <DateChips dates={d.dates} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {overall.next_steps.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-ink-muted">次の 1 歩</h3>
          <ol className="mt-2 flex flex-col gap-2.5">
            {overall.next_steps.map((step, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span aria-hidden className="inline-flex h-[22px] w-[22px] shrink-0 -translate-y-px items-center justify-center rounded-sm bg-accent text-xs font-bold text-on-accent">
                  {i + 1}
                </span>
                <span>
                {step.text}
                {step.sections.length > 0 && (
                  <span className="ml-2 text-xs">
                    {step.sections.map((key) => (
                      <a key={key} href={`#section-${key}`} className="mr-1 whitespace-nowrap rounded-sm bg-neutral px-2 py-0.5 text-ink hover:bg-neutral-hover">
                        {SECTION_LABELS[key]}
                      </a>
                    ))}
                  </span>
                )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      </div>
    </section>
  );
}

export function ReportView({ report }: { report: StoredReport }) {
  const content = report.content;
  const sections = content ? SECTION_KEYS.flatMap((key) => content.sections.filter((s) => s.key === key)) : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{reportTitle(report.kind, report.periodStart, report.periodEnd)}</h1>
        <p className="mt-1 text-sm text-ink-muted">{report.createdAt.toLocaleDateString("ja-JP")} に作成 ・ AI の分析は目安で、医療上の指示ではありません。</p>
      </div>

      {/* バッジが 1 つも無いときは、節ごと出さない(無い人にだけ「無い」と見せない)。条件は、作る画面(/reports)で読める */}
      {report.badges.length > 0 && (
        <section aria-label="今期のバッジ" className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">今期のバッジ</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {report.badges.map((badge) => (
              <BadgeChip key={badge.key} badge={badge} />
            ))}
          </ul>
          <BadgeConditions />
        </section>
      )}

      {content === null && <p className="text-sm text-ink-muted">レポートの文章を読み込めませんでした。</p>}

      {/* 総合評価は、バッジの直後に置く(結論を先に読めるように。項目ごとの詳しい内容は、その下) */}
      {content && <Overall overall={content.overall} />}

      {sections.map((section) => {
        const highlightDates = [...new Set(section.findings.flatMap((f) => f.dates))].sort();
        return (
          <section key={section.key} id={`section-${section.key}`} aria-label={SECTION_LABELS[section.key]} className="flex scroll-mt-4 flex-col gap-3">
            <h2 className="text-xl font-bold">{SECTION_LABELS[section.key]}</h2>
            <p className="text-base leading-relaxed font-semibold">{section.headline}</p>
            <Charts sectionKey={section.key} report={report} highlightDates={highlightDates} />
            <Findings findings={section.findings} />
          </section>
        );
      })}
    </div>
  );
}
