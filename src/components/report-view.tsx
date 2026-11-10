import Image from "next/image";
import { BadgeConditions } from "@/components/badge-conditions";
import { CalorieBalanceCard } from "@/components/calorie-balance-card";
import { CalorieCard } from "@/components/calorie-card";
import { PrintButton } from "@/components/print-button";
import { SleepCard } from "@/components/sleep-card";
import { ExerciseWeeklyCard, IntakeWeeklyCard, SleepWeeklyCard, WeeklyBandCard } from "@/components/weekly-cards";
import { TrendCard } from "@/components/trend-card";
import { BADGE_TIER_LABELS, BADGE_LABELS, type Badge } from "@/lib/report-badges";
import { SECTION_KEYS, SECTION_LABELS, type Finding, type ReportContent, type SectionKey } from "@/lib/report-content";
import { badgeSentence, reportFileName, reportTitle, shortDate } from "@/lib/report-format";
import type { StoredReport } from "@/lib/reports";
import { isLongTermReportKind } from "@/lib/report-period";
import { buildTrendViews } from "@/lib/trend-views";
import { formatDateInAppZone } from "@/lib/time-zone";
import { longTermWeekly } from "@/lib/weekly-points";

// レポートの表示(docs/ai-feedback.md)。保存した「作った時点の元の数字」から、グラフを描き直し(buildTrendViews)、AI の文章とマージして並べる。
// 並びは、取れたバッジ → 総合評価(結論を先に) → 項目ごとに「グラフ → AI の気づき」。評価(成績・点数)は出さず、取れたバッジだけを先頭に出す。
// 注目日付は、グラフに点線の印を引き、文章にも日付を書く(色だけに頼らない)。AI の分析は目安で、医療上の指示ではない
// バッジの絵は、public/badges/{種類}-{段階}.svg(9 個。Claude Design で作った。2026-11-10)。段階は絵の色と縁の形で表し、名前の文字も隣に出す

// 印刷(PDF)で、必ず新しいページから始める項目。グラフのある項目(睡眠・体・食事)は、それぞれ 1 ページにする。
// 運動・気持ち・日記・記録の習慣は、文章だけで短いので、運動からまとめて 1 ページ(運動の前だけ改ページ。2026-11-09、利用者の決定)。
// 運動の前の改ページをやめる試み(2026-11-10)は、四半期の PDF が崩れたので、元に戻した
const PRINT_PAGE_START: ReadonlySet<SectionKey> = new Set(["sleep", "body", "nutrition", "exercise"]);

function DateChips({ dates }: { dates: readonly string[] }) {
  if (dates.length === 0) return null;
  return <p className="mt-0.5 text-xs text-ink-muted">注目の日: {dates.map(shortDate).join("、")}</p>;
}

function Findings({ findings, lead }: { findings: readonly Finding[]; lead?: string }) {
  if (findings.length === 0 && !lead) return null;
  // 総合評価と同じ白い枠に入れる(枠なしで背景に直接置くと、上の部分と見た目がそろわない)。気づきの間は、薄い線で区切る。
  // lead(運動の「28 日のうち 17 日…」など)は、別の枠にせず、同じ枠の先頭に小さく出す(枠が 2 つに分かれて見えないように)
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface-raised p-4 text-[15px] leading-[1.8] sm:p-6 print:break-inside-avoid">
      {lead && <p className="text-sm text-ink-muted">{lead}</p>}
      {findings.length > 0 && (
        <ul className={`flex flex-col gap-4 [&>li+li]:border-t [&>li+li]:border-line-soft [&>li+li]:pt-4 ${lead ? "border-t border-line-soft pt-4" : ""}`}>
          {findings.map((finding, i) => (
            <li key={i}>
              <p>{finding.text}</p>
              <DateChips dates={finding.dates} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-surface-raised px-4.5 py-3.5 print:break-inside-avoid">
      {/* 飾り(alt は空): 種類と段階の名前は、隣の文字で読める。絵の本来の大きさ(64 × 72。SVG なので、ぼやけない) */}
      <Image src={`/badges/${badge.key}-${badge.tier}.svg`} alt="" width={64} height={72} className="shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">
          {BADGE_LABELS[badge.key]} {BADGE_TIER_LABELS[badge.tier]}
        </span>
        {/* 狭い幅(3 列)で、「収まりました」の途中で折り返さないよう、文節ごとに切れない塊にする(折り返しは、塊のあいだだけ) */}
        <span className="text-xs text-ink-muted">
          <span className="whitespace-nowrap">{badgeSentence(badge).count}</span>
          <span className="whitespace-nowrap">{badgeSentence(badge).result}</span>
        </span>
      </span>
    </li>
  );
}

// 運動の項目の先頭に出す 1 文(日付の一覧は出さない。日付は、グラフの注目日と、記録のカレンダーに出る)
function exerciseLead(report: StoredReport): string | undefined {
  if (!report.snapshot) return undefined;
  const days = new Set(report.snapshot.exercises.map((e) => e.date)).size;
  // 1〜2 日のときは、見出しや気づきの文章が、同じことを言うので、出さない(3 回も同じことが並ぶ)
  if (days === 0) return "いつもより多く動いた記録は、この期間にありませんでした。";
  return days <= 2 ? undefined : `${report.snapshot.dates.length} 日のうち ${days} 日で、いつもより多く動いた記録があります。`;
}

// 長期レポート(四半期・年)のグラフ: 1 本 = 1 週間(月曜始まり)。保存した日ごとの数字から、週ごとにまとめて描き直す(lib/weekly-points.ts)。
// 栄養素は、スナップショットに食事ごとの栄養素が入っていないので、グラフにしない(文章だけ)
function LongTermCharts({ sectionKey, report }: { sectionKey: SectionKey; report: StoredReport }) {
  if (!report.snapshot) return <p className="text-xs text-ink-muted">グラフの元の数字が読めないため、グラフは出せません。</p>;
  const weekly = longTermWeekly(report.snapshot);
  if (sectionKey === "sleep") return <SleepWeeklyCard points={weekly.sleepMinutes} />;
  if (sectionKey === "body") {
    return (
      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        <WeeklyBandCard title="体重" unit="kg" points={weekly.weightKg} step={1} format={{ kind: "fixed", digits: 2 }} tick="int" />
        <WeeklyBandCard title="体脂肪率" unit="%" points={weekly.bodyFatPercent} step={1} format={{ kind: "fixed", digits: 1 }} tick="int" />
      </div>
    );
  }
  if (sectionKey === "nutrition") return <IntakeWeeklyCard intake={weekly.intakeKcal} target={weekly.targetKcal} />;
  if (sectionKey === "exercise") return <ExerciseWeeklyCard weeks={weekly.exerciseDays} />;
  return null;
}

function Charts({ sectionKey, report, highlightDates }: { sectionKey: SectionKey; report: StoredReport; highlightDates: string[] }) {
  if (!report.snapshot) return <p className="text-xs text-ink-muted">グラフの元の数字が読めないため、グラフは出せません。</p>;
  const views = buildTrendViews(report.snapshot);
  const syncId = `report-${sectionKey}`;
  if (sectionKey === "sleep") return <SleepCard points={views.sleep} syncId={syncId} highlightDates={highlightDates} />;
  if (sectionKey === "body") {
    return (
      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
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
  return null; // 運動・気持ち・日記・記録の習慣は、グラフなし(運動の「いつもより動いた日数」の文は、気づきの枠の先頭に出す)
}

function Overall({ overall }: { overall: ReportContent["overall"] }) {
  return (
    <section aria-label="総合評価" className="flex flex-col gap-3">
      <h2 className="text-xl font-bold print:break-after-avoid">総合評価</h2>
      <div className="flex flex-col gap-5 rounded-lg bg-surface-raised p-4 text-[15px] sm:p-6 leading-[1.8] [&>div]:border-t [&>div]:border-line-soft [&>div]:pt-4.5 print:[&>div]:break-inside-avoid">
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
                  <span className="ml-2 text-xs print:hidden">
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-9 font-bold sm:text-[32px] sm:leading-10">{reportTitle(report.kind, report.periodStart, report.periodEnd)}</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatDateInAppZone(report.createdAt)} に作成 ・ AI の分析は目安で、医療上の指示ではありません。</p>
        </div>
        <PrintButton title={reportFileName(report.kind, report.periodStart, report.periodEnd)} />
      </div>

      {/* バッジが 1 つも無いときは、節ごと出さない(無い人にだけ「無い」と見せない)。条件は、作る画面(/reports)で読める */}
      {report.badges.length > 0 && (
        <section aria-label="今期のバッジ" className="flex flex-col gap-3">
          <h2 className="text-xl font-bold print:break-after-avoid">今期のバッジ</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
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
          <section key={section.key} id={`section-${section.key}`} aria-label={SECTION_LABELS[section.key]} className={`flex scroll-mt-4 flex-col gap-3 ${PRINT_PAGE_START.has(section.key) ? "print:break-before-page" : ""}`}>
            <h2 className="text-xl font-bold print:break-after-avoid">{SECTION_LABELS[section.key]}</h2>
            <p className="text-base leading-relaxed font-semibold print:break-after-avoid">{section.headline}</p>
            {isLongTermReportKind(report.kind) ? <LongTermCharts sectionKey={section.key} report={report} /> : <Charts sectionKey={section.key} report={report} highlightDates={highlightDates} />}
            <Findings findings={section.findings} lead={section.key === "exercise" && !isLongTermReportKind(report.kind) ? exerciseLead(report) : undefined} />
          </section>
        );
      })}
    </div>
  );
}
