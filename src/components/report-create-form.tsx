"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ReportFormState } from "@/app/(app)/reports/actions";
import { buttonClass } from "@/components/button";
import { AutoRefresh } from "@/components/auto-refresh";
import type { LongTermKindOptions, LongTermOptions } from "@/lib/long-term-options";
import { AI_CONSENT_CHECKBOX_LABEL, AI_CONSENT_POINTS, AI_CONSENT_REMINDER, AI_CONSENT_TITLE } from "@/lib/report-consent-text";
import { monthLabel, periodLabel } from "@/lib/report-format";

// レポートを作るフォーム(docs/ai-feedback.md)。同意は、最初の 1 回だけチェック(最初は外れている)。2 回目からは、1 行だけ(撤回できる)。
// 随時レポート(直近 4 週間。1 日に 1 回まで)・月次レポート(過去の、どの月でも、記録が十分にあれば選んで作れる。初期値は先月。同じ月は 1 回だけ)・四半期レポート(3 か月)・年次レポート(12 か月)は、枠を分ける。
// 作れる条件(期間の 7 割以上に記録のある日)を、ボタンの横に出す。作れないものは押せない(サーバーでも確かめる)。AI の返事は、裏で作られる(作成中の画面へ進む)
export type Eligibility = { recorded: number; required: number; missing: number; ok: boolean };

export type OnDemandView = Eligibility & {
  start: string;
  end: string;
  creatingId: number | null; // 作成中のレポートの id(押せない。作成中の画面へ)
  blockedToday: boolean; // 今日(03:00 区切り)もう作った(1 日に 1 回まで)
};

export type MonthView = Eligibility & {
  month: string; // "2026-10"
  existingId: number | null; // その月が、作成中かできているとき、そのレポートの id(同じ月は 1 回だけ)
  creatingId: number | null;
};

type Props = {
  onDemand: OnDemandView;
  months: MonthView[]; // 新しい月が先。初期値は先頭(先月)
  // 作ったレポートの一覧(サーバーで作った要素)。随時は最新の 1 件、定期は月ごと。それぞれの枠の中に出す
  onDemandSaved: ReactNode;
  periodicSaved: ReactNode;
  longTerm: LongTermOptions; // 四半期と年(選べる期間・作れる条件・次の解禁)
  quarterlySaved: ReactNode;
  yearlySaved: ReactNode;
  consented: boolean;
  action: (state: ReportFormState, formData: FormData) => Promise<ReportFormState>;
  revokeAction: () => Promise<void>;
};

export function ReportCreateForm({ onDemand, months, onDemandSaved, periodicSaved, longTerm, quarterlySaved, yearlySaved, consented, action, revokeAction }: Props) {
  const [state, formAction, isPending] = useActionState<ReportFormState, FormData>(action, null);
  const [checked, setChecked] = useState(false);
  const [month, setMonth] = useState(months[0]?.month ?? "");
  const [quarter, setQuarter] = useState(longTerm.quarterly.choices.find((c) => c.released)?.id ?? longTerm.quarterly.choices[0]?.id ?? "");
  const [year, setYear] = useState(longTerm.yearly.choices.find((c) => c.released)?.id ?? longTerm.yearly.choices[0]?.id ?? "");
  const canSubmit = (consented || checked) && !isPending;
  const selected = months.find((m) => m.month === month);
  const anyCreating = onDemand.creatingId !== null || months.some((m) => m.creatingId !== null) || [...longTerm.quarterly.choices, ...longTerm.yearly.choices].some((c) => c.creatingId !== null);
  // 読み上げ用。作成の開始と終わりを知らせる(画面は動かさないので、変わったことが、目に見える所にしか出ない)。変わったときだけ文を入れ替える
  const [wasCreating, setWasCreating] = useState(anyCreating);
  const [announcement, setAnnouncement] = useState("");
  if (wasCreating !== anyCreating) {
    setWasCreating(anyCreating);
    setAnnouncement(anyCreating ? "レポートを作成中です。ページを離れても続きます。" : "レポートの作成が終わりました。一覧を確認してください。");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 作成中のあいだ、数秒おきに状態を見に行く。ページを離れても、作成は続く(待たせない) */}
      {anyCreating && <AutoRefresh />}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        {consented ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
            <span>{AI_CONSENT_REMINDER}(同意済み)</span>
            <button type="submit" formAction={revokeAction} className="underline" disabled={isPending}>
              同意を撤回する
            </button>
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2.5 rounded-lg bg-badge-morning px-4 py-4 text-sm sm:px-5 sm:py-4.5">
            <legend className="float-left mb-1 w-full font-bold">{AI_CONSENT_TITLE}</legend>
            <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed text-ink-muted">
              {AI_CONSENT_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <label className="mt-1 flex cursor-pointer items-start gap-2.5 font-medium">
              <input type="checkbox" name="consent" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1" />
              <span>{AI_CONSENT_CHECKBOX_LABEL}</span>
            </label>
          </fieldset>
        )}

        <Frame title="随時レポート" description="ほしいときに、直近 4 週間の記録を振り返ります。1 日に 1 回まで作れて、最新の 1 件だけが残ります。" savedTitle="最新のレポート" saved={onDemandSaved}>
          <li className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold">直近 4 週間</p>
              <p className="text-xs text-ink-muted">
                {periodLabel(onDemand.start, onDemand.end)} ・{" "}
                {onDemand.creatingId !== null ? (
                  <>
                    <Spinner />
                    作成中(AI が分析しています。ページを離れても続きます。<Link href={`/reports/${onDemand.creatingId}`} className="underline">見る</Link>)
                  </>
                ) : onDemand.blockedToday ? (
                  <>今日は、もう作りました(随時レポートは、1 日に 1 回まで)。明日の 3:00 以降に、また作れます</>
                ) : (
                  <EligibilityText eligibility={onDemand} />
                )}
              </p>
            </div>
            {onDemand.creatingId === null && !onDemand.blockedToday && (
              <button type="submit" name="kind" value="four-weeks" disabled={!canSubmit || !onDemand.ok} className={`${buttonClass()} w-full sm:w-auto sm:min-w-24`}>
                {isPending ? "作成中..." : "作る"}
              </button>
            )}
          </li>
        </Frame>

        <Frame title="月次レポート" description="月ごとのレポートです。過去の月も、記録が十分にあれば、選んで作れます。同じ月は 1 回だけです(作ったあとは、いつでも開けます)。" savedTitle="作ったレポート" saved={periodicSaved}>
          {months.length === 0 || selected === undefined ? (
            <li className="text-sm text-ink-muted">作れる月が、まだありません。月が変わると、前の月のレポートが作れます。</li>
          ) : (
            <li className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="report-month" className="text-sm font-semibold">
                  作る月
                </label>
                <select id="report-month" name="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-md border sm:w-auto sm:min-w-48 border-line bg-surface-raised px-3 py-2 text-sm text-ink">
                  {months.map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthLabel(m.month)}
                      {m.existingId !== null ? "(作成済み)" : !m.ok ? "(記録が足りません)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-muted">
                  {selected.existingId !== null ? (
                    <>
                      {selected.creatingId !== null && <Spinner />}
                      {selected.creatingId !== null ? "作成中(AI が分析しています。ページを離れても続きます。" : "作成済み("}<Link href={`/reports/${selected.existingId}`} className="underline">見る</Link>)
                    </>
                  ) : (
                    <EligibilityText eligibility={selected} />
                  )}
                </p>
              </div>
              {selected.existingId === null && (
                <button type="submit" name="kind" value="monthly" disabled={!canSubmit || !selected.ok} className={`${buttonClass()} w-full sm:w-auto sm:min-w-24`}>
                  {isPending ? "作成中..." : "作る"}
                </button>
              )}
            </li>
          )}
        </Frame>

        <Frame
          title="四半期レポート"
          description="3 か月ごとの、少し長い目での振り返りです。期間(1〜3 月、4〜6 月、7〜9 月、10〜12 月)が終わった翌日から作れます。同じ期間は 1 回だけです(作ったあとは、いつでも開けます)。"
          savedTitle="作ったレポート"
          saved={quarterlySaved}
        >
          <LongTermRow label="作る四半期" selectName="quarter" kind="quarterly" options={longTerm.quarterly} value={quarter} onChange={setQuarter} canSubmit={canSubmit} isPending={isPending} />
        </Frame>

        <Frame
          title="年次レポート"
          description="1 年(12 か月)の、長い目での振り返りです。1〜12 月が終わった翌日から作れます。同じ年は 1 回だけです(作ったあとは、いつでも開けます)。"
          savedTitle="作ったレポート"
          saved={yearlySaved}
        >
          <LongTermRow label="作る年" selectName="year" kind="yearly" options={longTerm.yearly} value={year} onChange={setYear} canSubmit={canSubmit} isPending={isPending} />
        </Frame>

        {state?.message && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}

// 四半期・年次レポート 1 種類ぶんの行: 期間を選んで「作る」。作れない理由(まだ解禁前・記録が足りない・作成済み・作成中)と、次の解禁までの日数を、案内する
function LongTermRow({ label, selectName, kind, options, value, onChange, canSubmit, isPending }: { label: string; selectName: string; kind: "quarterly" | "yearly"; options: LongTermKindOptions; value: string; onChange: (value: string) => void; canSubmit: boolean; isPending: boolean }) {
  const selected = options.choices.find((c) => c.id === value);
  const nextText = `次は、${options.next.title}。${options.next.releaseDate} から作れます(あと ${options.next.daysLeft} 日)`;
  return (
    <li className="flex flex-col gap-2">
      {options.choices.length === 0 || selected === undefined ? (
        <>
          <p className="text-[15px] font-semibold">{label}</p>
          <p className="text-xs text-ink-muted">作れる期間が、まだありません。{nextText}。</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`report-${selectName}`} className="text-sm font-semibold">
              {label}
            </label>
            <select id={`report-${selectName}`} name={selectName} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border sm:w-auto sm:min-w-64 border-line bg-surface-raised px-3 py-2 text-sm text-ink">
              {options.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.existingId !== null ? "(作成済み)" : !c.released ? "(開発用: 終わった月だけ)" : !c.ok ? "(記録が足りません)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted">
              {selected.existingId !== null ? (
                <>
                  {selected.creatingId !== null && <Spinner />}
                  {selected.creatingId !== null ? "作成中(AI が分析しています。ページを離れても続きます。" : "作成済み("}<Link href={`/reports/${selected.existingId}`} className="underline">見る</Link>)
                </>
              ) : selected.ok ? (
                <>記録が十分にある月 {selected.usableMonths} か月(作れます)</>
              ) : (
                <>記録が十分にある月 {selected.usableMonths} / {selected.requiredMonths} か月。あと {selected.missing} か月ぶんの記録で作れます</>
              )}
            </p>
          </div>
          {selected.existingId === null && (
            <button type="submit" name="kind" value={kind} disabled={!canSubmit || !selected.ok} className={`${buttonClass()} w-full sm:w-auto sm:min-w-24`}>
              {isPending ? "作成中..." : "作る"}
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-ink-muted">{nextText}。</p>
    </li>
  );
}

// 作成中の印(小さな回る輪。動きを減らす設定のときは回らない)
function Spinner() {
  return <span aria-hidden className="mr-1.5 inline-block h-3 w-3 translate-y-0.5 rounded-full border-2 border-neutral border-t-accent motion-safe:animate-spin" />;
}

function EligibilityText({ eligibility }: { eligibility: Eligibility }) {
  return eligibility.ok ? (
    <>記録のある日 {eligibility.recorded} 日(作れます)</>
  ) : (
    <>
      記録のある日 {eligibility.recorded} / {eligibility.required} 日。あと {eligibility.missing} 日の記録で作れます
    </>
  );
}

// 枠(随時・定期)。上に「作る」の行、下に、その種類の作ったレポート
function Frame({ title, description, savedTitle, saved, children }: { title: string; description: string; savedTitle: string; saved: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-lg bg-surface-raised p-4 sm:p-5">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line-soft border-t border-line-soft pt-4">{children}</ul>
      <div>
        <h3 className="mb-2 text-xs font-bold text-ink-muted">{savedTitle}</h3>
        {saved}
      </div>
    </section>
  );
}
