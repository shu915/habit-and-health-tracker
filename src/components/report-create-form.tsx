"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ReportFormState } from "@/app/(app)/reports/actions";
import { buttonClass } from "@/components/button";
import { ReportProcessingIndicator } from "@/components/processing-indicator";
import { AI_CONSENT_CHECKBOX_LABEL, AI_CONSENT_POINTS, AI_CONSENT_REMINDER, AI_CONSENT_TITLE } from "@/lib/report-consent-text";
import { monthLabel, periodLabel } from "@/lib/report-format";

// レポートを作るフォーム(docs/ai-feedback.md)。同意は、最初の 1 回だけチェック(最初は外れている)。2 回目からは、1 行だけ(撤回できる)。
// 随時レポート(直近 4 週間。1 日に 1 回まで)と、定期レポート(月次。過去の、どの月でも、記録が十分にあれば選んで作れる。初期値は先月。同じ月は 1 回だけ)は、枠を分ける。
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
  consented: boolean;
  action: (state: ReportFormState, formData: FormData) => Promise<ReportFormState>;
  revokeAction: () => Promise<void>;
};

export function ReportCreateForm({ onDemand, months, onDemandSaved, periodicSaved, consented, action, revokeAction }: Props) {
  const [state, formAction, isPending] = useActionState<ReportFormState, FormData>(action, null);
  const [checked, setChecked] = useState(false);
  const [month, setMonth] = useState(months[0]?.month ?? "");
  const canSubmit = (consented || checked) && !isPending;
  const selected = months.find((m) => m.month === month);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {consented ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
            <span>{AI_CONSENT_REMINDER}(同意済み)</span>
            <button type="submit" formAction={revokeAction} className="underline" disabled={isPending}>
              同意を撤回する
            </button>
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <legend className="px-1 font-medium">{AI_CONSENT_TITLE}</legend>
            <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-400">
              {AI_CONSENT_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <label className="mt-1 flex items-start gap-2">
              <input type="checkbox" name="consent" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1" />
              <span>{AI_CONSENT_CHECKBOX_LABEL}</span>
            </label>
          </fieldset>
        )}

        <Frame title="随時レポート" description="ほしいときに、直近 4 週間の記録を振り返ります。1 日に 1 回まで作れて、最新の 1 件だけが残ります。" savedTitle="最新のレポート" saved={onDemandSaved}>
          <li className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">直近 4 週間</p>
              <p className="text-xs text-zinc-500">
                {periodLabel(onDemand.start, onDemand.end)} ・{" "}
                {onDemand.creatingId !== null ? (
                  <>
                    作成中(<Link href={`/reports/${onDemand.creatingId}`} className="underline">見る</Link>)
                  </>
                ) : onDemand.blockedToday ? (
                  <>今日は、もう作りました(随時レポートは、1 日に 1 回まで)。明日の 3:00 以降に、また作れます</>
                ) : (
                  <EligibilityText eligibility={onDemand} />
                )}
              </p>
            </div>
            {onDemand.creatingId === null && !onDemand.blockedToday && (
              <button type="submit" name="kind" value="four-weeks" disabled={!canSubmit || !onDemand.ok} className={buttonClass()}>
                {isPending ? "作成中..." : "作る"}
              </button>
            )}
          </li>
        </Frame>

        <Frame title="定期レポート" description="月ごとのレポートです。過去の月も、記録が十分にあれば、選んで作れます。同じ月は 1 回だけです(作ったあとは、いつでも開けます)。" savedTitle="作ったレポート" saved={periodicSaved}>
          {months.length === 0 || selected === undefined ? (
            <li className="text-sm text-zinc-500">作れる月が、まだありません。月が変わると、前の月のレポートが作れます。</li>
          ) : (
            <li className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="report-month" className="text-sm font-medium">
                  作る月
                </label>
                <select id="report-month" name="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700">
                  {months.map((m) => (
                    <option key={m.month} value={m.month}>
                      {monthLabel(m.month)}
                      {m.existingId !== null ? "(作成済み)" : !m.ok ? "(記録が足りません)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  {selected.existingId !== null ? (
                    <>
                      {selected.creatingId !== null ? "作成中" : "作成済み"}(<Link href={`/reports/${selected.existingId}`} className="underline">見る</Link>)
                    </>
                  ) : (
                    <EligibilityText eligibility={selected} />
                  )}
                </p>
              </div>
              {selected.existingId === null && (
                <button type="submit" name="kind" value="monthly" disabled={!canSubmit || !selected.ok} className={buttonClass()}>
                  {isPending ? "作成中..." : "作る"}
                </button>
              )}
            </li>
          )}
        </Frame>

        {isPending && <ReportProcessingIndicator />}
        {state?.message && (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
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
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">{children}</ul>
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-500">{savedTitle}</h3>
        {saved}
      </div>
    </section>
  );
}
