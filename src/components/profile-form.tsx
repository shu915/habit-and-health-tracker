"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { buttonClass } from "@/components/button";
import { FormActions } from "@/components/form-actions";
import { saveProfileAction, type ProfileFormState } from "@/app/(app)/profile/actions";
import { PairInput, durationParts, timeParts } from "@/components/pair-input";
import { joinMinutes, joinTimeOfDay } from "@/lib/duration";
import { formatRange } from "@/lib/profile-limits";
import type { RecentMeasure } from "@/lib/recent-measures";
import { ACTIVITY_LEVEL_OPTIONS, GENDER_OPTIONS } from "@/lib/profile-options";
import {
  energySummary,
  SUGGESTABLE_FIELDS,
  suggestTargets,
  type FormValues,
  type SuggestableField,
  type SuggestResult,
} from "@/lib/profile-suggest";
// zod を含む profile-schema.ts は、ブラウザ側のコードに入れないよう、型だけを読む
import type { ProfileField } from "@/lib/profile-schema";

// プロフィールの手入力フォーム(見た目はこれから整える)。
// 値はすべて文字列で送り、検証と変換はサーバー側(profile-schema.ts)で行う。空欄は「未入力」になる
export type ProfileFormInitial = Record<ProfileField, string>;

// description: 何の値で、どう決めればよいか(欄の下に出す説明)。range: 入力できる範囲
type FieldBase = { name: ProfileField; label: string; description: string };
type FieldDef =
  | (FieldBase & { kind: "text"; unit?: string; inputMode: "decimal" | "numeric"; range: string })
  | (FieldBase & { kind: "time" })
  | (FieldBase & { kind: "duration"; range: string }) // 長さ。「時間」「分」の 2 つの欄で入力し、裏で分に変換して送る
  | (FieldBase & { kind: "radio"; options: readonly { value: string; label: string }[] }) // 選択肢が少ないもの。横並びのラジオボタン
  | (FieldBase & { kind: "activity" }); // 活動係数: 5 択を、掛ける数字・名前・説明の列で並べるラジオボタン

const BODY_FIELDS: FieldDef[] = [
  { name: "gender", label: "性別", kind: "radio", options: GENDER_OPTIONS, description: "基礎代謝の計算に使います。" },
  { name: "age", label: "年齢", kind: "text", unit: "歳", inputMode: "numeric", range: formatRange("age"), description: "基礎代謝の計算に使います。" },
  { name: "heightCm", label: "身長", kind: "text", unit: "cm", inputMode: "decimal", range: formatRange("heightCm"), description: "基礎代謝の計算に使います。" },
  { name: "currentWeightKg", label: "現在の体重", kind: "text", unit: "kg", inputMode: "decimal", range: formatRange("currentWeightKg"), description: "今の目安の体重です。" },
  { name: "currentBodyFatPercent", label: "体脂肪率", kind: "text", unit: "%", inputMode: "decimal", range: formatRange("currentBodyFatPercent"), description: "体重計の値。毎朝同じ条件で測ります(任意)。" },
  { name: "currentWaistCm", label: "ウエスト", kind: "text", unit: "cm", inputMode: "decimal", range: formatRange("currentWaistCm"), description: "おへその高さで測ります(任意)。" },
  // 活動係数は目標ではなく本人の状態(基礎代謝に掛けて消費カロリーを出す)
  { name: "activityLevel", label: "活動係数", kind: "activity", description: "迷ったら「軽い」。1日の消費カロリーは、基礎代謝にこの数字を掛けて見積もります。" },
];

const GOAL_FIELDS: FieldDef[] = [
  { name: "targetWeightKg", label: "目標体重", kind: "text", unit: "kg", inputMode: "decimal", range: formatRange("targetWeightKg"), description: "達成したい体重です。" },
  { name: "targetCalories", label: "目標カロリー", kind: "text", unit: "kcal", inputMode: "numeric", range: formatRange("targetCalories"), description: "1日に食べる量の目標です。" },
];

const SLEEP_FIELDS: FieldDef[] = [
  { name: "targetSleepMinutes", label: "睡眠時間の目標", kind: "duration", range: "2〜18時間", description: "1晩に寝たい長さ。空にすると、睡眠の機能を使いません。" },
  { name: "targetSleepMidpoint", label: "睡眠の中間時刻", kind: "time", description: "寝た時刻と起きた時刻の真ん中。23時30分に寝て 7時に起きるなら 3時15分。" },
];

// フォームの全項目の名前(zod を読み込まないよう、項目の定義から作る)
const ALL_FIELDS: ProfileField[] = [...BODY_FIELDS, ...GOAL_FIELDS, ...SLEEP_FIELDS].map((field) => field.name);

// フォームに今入力されている値を、項目名 → 文字列で読む
function readValues(data: FormData): FormValues {
  const values: FormValues = {};
  for (const field of ALL_FIELDS) {
    const value = data.get(field);
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

// 「提案」ボタンを押した結果。入力欄に入れた値(ほかの欄に入力中の値も含む)と、根拠・理由を持つ
type Draft = {
  values: FormValues;
  notes: SuggestResult["notes"];
  errors: SuggestResult["errors"];
  cleared: ProfileField[]; // 「直近の記録から入れる」で値を入れた欄。保存に失敗したときのサーバーのエラーは、入れ直したあとは出さない(次に保存するまで)
  at: number;
};

// 直近の朝の記録の中央値(サーバーが計算して渡す。記録が無い項目は null)
export type RecentMeasures = { weight: RecentMeasure | null; bodyFat: RecentMeasure | null };

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const describeRecent = (measure: RecentMeasure) => `${measure.value}(${measure.count} 日分${measure.count > 1 ? `、${shortDate(measure.from)}〜${shortDate(measure.to)}` : `、${shortDate(measure.to)}`})`;

// 「直近の記録から入れる」ボタンを置く欄
type RecentKind = keyof RecentMeasures;
const RECENT_FIELDS: Record<RecentKind, { name: ProfileField }> = {
  weight: { name: "currentWeightKg" },
  bodyFat: { name: "currentBodyFatPercent" },
};

export function ProfileForm({ initial, recent = { weight: null, bodyFat: null } }: { initial: ProfileFormInitial; recent?: RecentMeasures }) {
  const [state, formAction, isPending] = useActionState<ProfileFormState, FormData>(saveProfileAction, null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // 消費カロリーの目安の表示に使う、フォームの今の入力値
  const [live, setLive] = useState<FormValues>(initial);
  const [filled, setFilled] = useState<Partial<Record<RecentKind, string>>>({}); // 「直近の記録から入れる」で入れた値の知らせ(その欄を直したら消す)
  const formRef = useRef<HTMLFormElement>(null);

  // 表示する値: 保存に失敗したときは送った値を、提案したときは提案後の値を残す(新しいほうを使う)
  const draftIsLatest = draft !== null && draft.at > (state?.submittedAt ?? 0);
  const current: FormValues = draftIsLatest ? draft.values : (state?.values ?? initial);
  const valueOf = (name: ProfileField) => current[name] ?? initial[name];
  // 表示するエラー: 保存に失敗したあとに、その欄を「直近の記録から入れる」で入れ直したなら、その欄の古いエラーは出さない
  const serverErrors = draftIsLatest && state?.errors ? Object.fromEntries(Object.entries(state.errors).filter(([name]) => !draft.cleared.some((cleared) => cleared === name))) : state?.errors;

  // 「提案」ボタン: 押した項目だけを、フォームに今入力されている値から計算して、入力欄を埋める。
  // 保存はしない(本人が確認して直し、「保存」で確定する)。ほかの項目の提案の根拠は残す
  function handleSuggest(field: SuggestableField) {
    if (!formRef.current) return;
    const values = readValues(new FormData(formRef.current));
    const result = suggestTargets(values, [field]);
    const next = { ...values, ...result.values };

    const notes = { ...draft?.notes };
    const errors = { ...draft?.errors };
    delete notes[field];
    delete errors[field];
    setDraft({
      values: next,
      notes: { ...notes, ...result.notes },
      errors: { ...errors, ...result.errors },
      cleared: draft?.cleared ?? [],
      at: Date.now(),
    });
    setLive(next);
  }

  // 「直近の記録から入れる」ボタン(体重・体脂肪率の欄の隣): 押した欄を、直近 5 日分の中央値で埋める。保存はしない(本人が確認して「保存」)。
  // ほかの欄と、提案の根拠は、そのまま残す
  function handleFillRecent(kind: RecentKind) {
    const measure = recent[kind];
    if (!formRef.current || !measure) return;
    const field = RECENT_FIELDS[kind];
    const next: FormValues = { ...readValues(new FormData(formRef.current)), [field.name]: measure.value };
    setDraft({ values: next, notes: { ...draft?.notes }, errors: { ...draft?.errors }, cleared: [...(draft?.cleared ?? []), field.name], at: Date.now() });
    setLive(next);
    setFilled((current) => ({ ...current, [kind]: `直近の記録の中央値を入れました: ${describeRecent(measure)}。まだ保存されていません。` }));
  }

  // 提案した値を本人が手で直したら、「提案の根拠」の表示は外す(今の値の根拠ではなくなるため)
  function handleChange(event: React.ChangeEvent<HTMLFormElement>) {
    if (!formRef.current) return;
    setLive(readValues(new FormData(formRef.current)));

    for (const [kind, field] of Object.entries(RECENT_FIELDS)) {
      if (event.target.name === field.name) setFilled((current) => ({ ...current, [kind]: undefined }));
    }

    const edited = SUGGESTABLE_FIELDS.find((field) => field === event.target.name);
    if (draft && edited && (draft.notes[edited] || draft.errors[edited])) {
      setDraft({ ...draft, notes: { ...draft.notes, [edited]: undefined }, errors: { ...draft.errors, [edited]: undefined } });
    }
  }

  return (
    <form
      ref={formRef}
      key={`${state?.submittedAt ?? "initial"}-${draft?.at ?? 0}`}
      action={formAction}
      onChange={handleChange}
      className="flex flex-col gap-5"
    >
      {state && Object.keys(state.errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          入力内容を確認してください。
        </p>
      )}
      <Group
        title="ボディデータ"
        fields={BODY_FIELDS}
        valueOf={valueOf}
        errors={serverErrors}
        live={live}
        recentOf={(name) => {
          const kind = (Object.keys(RECENT_FIELDS) as RecentKind[]).find((k) => RECENT_FIELDS[k].name === name);
          return kind ? { available: recent[kind] !== null, note: filled[kind], onFill: () => handleFillRecent(kind) } : undefined;
        }}
        footer={<RecentNote recent={recent} />}
      />
      <Group
        title="目標値"
        fields={[...GOAL_FIELDS, ...SLEEP_FIELDS]}
        gapBefore="targetSleepMinutes"
        valueOf={valueOf}
        errors={serverErrors}
        live={live}
        draft={draft}
        onSuggest={handleSuggest}
        footer={
          // 説明と注意書きは別の段落にして、左寄せで1行ずつ読めるようにする
          <div className="flex flex-col gap-1 border-t border-line-soft pt-4 text-left text-xs leading-relaxed text-ink-muted">
            <p>「提案」ボタンは、いま入力されている値から計算して、その欄を埋めるだけです。まだ保存されません。</p>
            <p>確認して、必要なら直してから「保存」を押してください。</p>
            <p className="text-ink-subtle">計算は一般的な式による目安で、医療上の指示ではありません（18 歳以上が対象です）。</p>
          </div>
        }
      />
      <FormActions>
        <Link href="/" className={buttonClass({ variant: "secondary", size: "action" })}>
          キャンセル
        </Link>
        <button type="submit" disabled={isPending} className={buttonClass({ size: "action" })}>
          {isPending ? "保存中..." : "保存"}
        </button>
      </FormActions>
    </form>
  );
}

// 体重・体脂肪率の「直近の記録から入れる」ボタンの説明(ボタンは各欄の隣)
function RecentNote({ recent }: { recent: RecentMeasures }) {
  const available = recent.weight !== null || recent.bodyFat !== null;
  return (
    <div className="flex flex-col gap-1 border-t border-line-soft pt-4 text-left text-xs leading-relaxed text-ink-muted">
      {available ? (
        <p>
          「直近の記録から入れる」は、朝の体重・体脂肪率が入っている、新しい 5 日分の<strong className="font-medium text-ink">中央値</strong>を、その欄に入れます。まだ保存されません。確認して、「保存」を押してください。
        </p>
      ) : (
        <p>朝の体重・体脂肪率の記録が、まだありません。日の記録に入れると、「直近の記録から入れる」で、ここに入れられます。</p>
      )}
      <p className="text-ink-subtle">
        体組成計の値は、水分や食事で日ごとにぶれます。1 日の値より、直近の中央値のほうが、基礎代謝や目標の計算が安定します(平均にしないのは、飲み会の翌朝などの極端な日に引きずられないため)。5 日に満たないときは、あるだけで計算します。記録が無い欄は、変えません。
      </p>
    </div>
  );
}

function Group({
  title,
  fields,
  gapBefore,
  valueOf,
  errors,
  live,
  draft,
  onSuggest,
  recentOf,
  footer,
}: {
  title: string;
  fields: FieldDef[];
  gapBefore?: ProfileField; // この項目の前に、区切り線を引く
  valueOf: (name: ProfileField) => string;
  errors: Partial<Record<ProfileField, string>> | undefined;
  live: FormValues;
  draft?: Draft | null;
  onSuggest?: (field: SuggestableField) => void;
  recentOf?: (name: ProfileField) => RecentFill | undefined;
  footer?: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-5 rounded-lg bg-surface-raised p-5">
      <legend className="float-left mb-1 w-full text-xs font-bold text-ink-muted">{title}</legend>
      {fields.map((field) => {
        const suggestable = SUGGESTABLE_FIELDS.find((name) => name === field.name);
        return (
          <div key={field.name} className={field.name === gapBefore ? "border-t border-line-soft pt-5" : undefined}>
            <Field
              field={field}
              value={valueOf(field.name)}
              error={errors?.[field.name]}
              live={live}
              recentFill={recentOf?.(field.name)}
              suggestion={
                suggestable && onSuggest
                  ? {
                      note: draft?.notes[suggestable],
                      error: draft?.errors[suggestable],
                      onSuggest: () => onSuggest(suggestable),
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
      {footer}
    </fieldset>
  );
}

// 「直近の記録から入れる」: 記録があるか(無ければボタンは押せない)、入れたあとの知らせ、押したときの動き
type RecentFill = { available: boolean; note: string | undefined; onFill: () => void };

type Suggestion = { note: string | undefined; error: string | undefined; onSuggest: () => void };

function Field({
  field,
  value,
  error,
  live,
  recentFill,
  suggestion,
}: {
  field: FieldDef;
  value: string;
  error: string | undefined;
  live: FormValues;
  recentFill: RecentFill | undefined;
  suggestion: Suggestion | undefined;
}) {
  const id = `profile-${field.name}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    name: field.name,
    defaultValue: value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className: "w-44 rounded-md border border-line bg-surface-raised px-3 py-2 text-[15px] text-ink tabular-nums",
  } as const;

  return (
    <div className="grid items-start gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_1fr]">
      {field.kind === "activity" || field.kind === "radio" ? (
        <span id={`${id}-label`} className="pt-2 text-ink-muted">
          {field.label}
        </span>
      ) : (
        <label htmlFor={id} className="pt-2 text-ink-muted">
          {field.label}
        </label>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {field.kind === "text" && (
            <>
              <input {...common} type="text" inputMode={field.inputMode} autoComplete="off" />
              {field.unit && <span className="text-ink-muted">{field.unit}</span>}
              {recentFill && (
                <button
                  type="button"
                  onClick={recentFill.onFill}
                  disabled={!recentFill.available}
                  aria-label={`${field.label}を直近の記録から入れる`}
                  className={`sm:ml-2 ${buttonClass({ variant: "secondary", size: "sm" })}`}
                >
                  直近の記録から入れる
                </button>
              )}
              {suggestion && (
                <button
                  type="button"
                  onClick={suggestion.onSuggest}
                  aria-label={`${field.label}を提案`}
                  className={`sm:ml-2 ${buttonClass({ variant: "secondary", size: "sm" })}`}
                >
                  提案
                </button>
              )}
            </>
          )}
          {field.kind === "duration" && (
            <PairInput
              id={id}
              name={field.name}
              label={field.label}
              units={["時間", "分"]}
              initial={durationParts(value)}
              join={joinMinutes}
              error={error}
              errorId={errorId}
            />
          )}
          {field.kind === "time" && (
            <PairInput
              id={id}
              name={field.name}
              label={field.label}
              units={["時", "分"]}
              initial={timeParts(value)}
              join={joinTimeOfDay}
              error={error}
              errorId={errorId}
            />
          )}
        </div>
        {field.kind === "radio" && (
          <RadioRow id={id} name={field.name} value={value} options={field.options} error={error} errorId={errorId} />
        )}
        {field.kind === "activity" && (
          <>
            <ActivityLevelRadios id={id} name={field.name} value={value} error={error} errorId={errorId} />
            <EnergyPreview values={live} />
          </>
        )}
        <p className="text-xs text-ink-muted">
          {field.description}
          {(field.kind === "text" || field.kind === "duration") && (
            <span className="text-ink-subtle"> ({field.range})</span>
          )}
        </p>
        {recentFill?.note && (
          <p role="status" className="text-xs leading-relaxed text-accent">
            {recentFill.note}
          </p>
        )}
        {suggestion?.note && (
          <p className="text-xs leading-relaxed text-accent">提案の根拠: {suggestion.note}</p>
        )}
        {suggestion?.error && <p className="text-xs text-red-600 dark:text-red-400">{suggestion.error}</p>}
        {error && (
          <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// 活動係数の下に出す、1 日の消費カロリーの目安(基礎代謝 × 活動係数)。入力に合わせて自動で変わる
function EnergyPreview({ values }: { values: FormValues }) {
  const energy = energySummary(values);
  const box = "mt-1 rounded-md bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-muted";

  if (!energy.ok) {
    return (
      <p className={box}>1日の消費カロリーの目安を出すには、{energy.missing.join("・")}の入力が必要です。</p>
    );
  }
  const method = energy.method === "katch-mcardle" ? "体脂肪率から計算" : "身長・体重・年齢・性別から計算";
  if (energy.tdeeKcal === null) {
    return (
      <p className={box}>
        基礎代謝: 約 {energy.bmrKcal.toLocaleString("ja-JP")} kcal（{method}）。活動係数を選ぶと、1日の消費カロリーの目安が出ます。
      </p>
    );
  }
  return (
    <p className={box}>
      <strong className="text-sm text-ink">
        1日の消費カロリーの目安: 約 {energy.tdeeKcal.toLocaleString("ja-JP")} kcal
      </strong>
      （基礎代謝 {energy.bmrKcal.toLocaleString("ja-JP")} × {energy.activityLevel}。{method}）
    </p>
  );
}

// 活動係数: 掛ける数字・名前・説明を列でそろえて、5 択を一度に見比べられるようにする
function ActivityLevelRadios({
  id,
  name,
  value,
  error,
  errorId,
}: {
  id: string;
  name: ProfileField;
  value: string;
  error: string | undefined;
  errorId: string;
}) {
  const known = ACTIVITY_LEVEL_OPTIONS.some((option) => Number(option.value) === Number(value));
  const rowClass = "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2.5 py-1.5 hover:bg-surface-hover";

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col"
    >
      <label className={rowClass}>
        <input type="radio" name={name} value="" defaultChecked={value === ""} />
        <span className="text-ink-muted">未選択</span>
      </label>
      {ACTIVITY_LEVEL_OPTIONS.map((option) => (
        <label key={option.value} className={rowClass}>
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={value !== "" && Number(value) === Number(option.value)}
          />
          <span className="w-14 font-semibold tabular-nums">×{option.multiplier}</span>
          <span className="w-20">{option.name}</span>
          <span className="text-xs text-ink-muted">{option.detail}</span>
        </label>
      ))}
      {/* DB の値が選択肢に無いとき(AI の提案など)に、黙って「未選択」に見えて消えないよう、現在の値を出す。
          保存するには選択肢から選び直す必要がある(検証は選択肢だけを受け付ける) */}
      {value !== "" && !known && (
        <label className={rowClass}>
          <input type="radio" name={name} value={value} defaultChecked />
          <span className="w-14 font-semibold tabular-nums">×{Number(value)}</span>
          <span className="text-xs text-ink-muted">現在の値。選択肢から選び直してください</span>
        </label>
      )}
    </div>
  );
}

// 選択肢が少ない項目(性別など): 横並びのラジオボタン。空欄は「未選択」(null になる)
function RadioRow({
  id,
  name,
  value,
  options,
  error,
  errorId,
}: {
  id: string;
  name: ProfileField;
  value: string;
  options: readonly { value: string; label: string }[];
  error: string | undefined;
  errorId: string;
}) {
  const known = options.some((option) => option.value === value);
  const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-surface-hover";

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-wrap"
    >
      {options.map((option) => (
        <label key={option.value} className={itemClass}>
          <input type="radio" name={name} value={option.value} defaultChecked={value === option.value} />
          {option.label}
        </label>
      ))}
      {/* DB の値が選択肢に無いときに、黙って「未選択」に見えて消えないよう、現在の値を出す */}
      {value !== "" && !known && (
        <label className={itemClass}>
          <input type="radio" name={name} value={value} defaultChecked />
          {value}(現在の値。選び直してください)
        </label>
      )}
      <label className={itemClass}>
        <input type="radio" name={name} value="" defaultChecked={value === ""} />
        <span className="text-ink-muted">未選択</span>
      </label>
    </div>
  );
}
