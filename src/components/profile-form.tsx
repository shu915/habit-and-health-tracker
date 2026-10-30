"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveProfileAction, type ProfileFormState } from "@/app/(app)/profile/actions";
import { PairInput, durationParts, timeParts } from "@/components/pair-input";
import { joinMinutes, joinTimeOfDay } from "@/lib/duration";
import { formatRange } from "@/lib/profile-limits";
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
];

const GOAL_FIELDS: FieldDef[] = [
  { name: "activityLevel", label: "活動係数", kind: "activity", description: "迷ったら「軽い」。1日の消費カロリーは、基礎代謝にこの数字を掛けて見積もります。" },
  { name: "targetWeightKg", label: "目標体重", kind: "text", unit: "kg", inputMode: "decimal", range: formatRange("targetWeightKg"), description: "達成したい体重です。" },
  { name: "targetCalories", label: "目標カロリー", kind: "text", unit: "kcal", inputMode: "numeric", range: formatRange("targetCalories"), description: "1日に食べる量の目標です。" },
  { name: "targetProteinG", label: "目標タンパク質", kind: "text", unit: "g", inputMode: "decimal", range: formatRange("targetProteinG"), description: "1日に摂る量。目安は体重1kgあたり1〜1.6g。" },
  { name: "targetSleepMinutes", label: "睡眠時間の目標", kind: "duration", range: "2〜18時間", description: "1晩に寝たい長さ。空にすると、睡眠の機能を使いません。" },
  { name: "targetSleepMidpoint", label: "睡眠の中間時刻", kind: "time", description: "寝た時刻と起きた時刻の真ん中。23時30分に寝て 7時に起きるなら 3時15分。" },
];

// フォームの全項目の名前(zod を読み込まないよう、項目の定義から作る)
const ALL_FIELDS: ProfileField[] = [...BODY_FIELDS, ...GOAL_FIELDS].map((field) => field.name);

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
  at: number;
};

export function ProfileForm({ initial }: { initial: ProfileFormInitial }) {
  const [state, formAction, isPending] = useActionState<ProfileFormState, FormData>(saveProfileAction, null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // 消費カロリーの目安の表示に使う、フォームの今の入力値
  const [live, setLive] = useState<FormValues>(initial);
  const formRef = useRef<HTMLFormElement>(null);

  // 表示する値: 保存に失敗したときは送った値を、提案したときは提案後の値を残す(新しいほうを使う)
  const draftIsLatest = draft !== null && draft.at > (state?.submittedAt ?? 0);
  const current: FormValues = draftIsLatest ? draft.values : (state?.values ?? initial);
  const valueOf = (name: ProfileField) => current[name] ?? initial[name];

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
      at: Date.now(),
    });
    setLive(next);
  }

  // 提案した値を本人が手で直したら、「提案の根拠」の表示は外す(今の値の根拠ではなくなるため)
  function handleChange(event: React.ChangeEvent<HTMLFormElement>) {
    if (!formRef.current) return;
    setLive(readValues(new FormData(formRef.current)));

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
      className="flex flex-col gap-6"
    >
      {state && Object.keys(state.errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600">
          入力内容を確認してください。
        </p>
      )}
      <Group title="ボディデータ" fields={BODY_FIELDS} valueOf={valueOf} errors={state?.errors} live={live} />
      <Group
        title="目標値"
        fields={GOAL_FIELDS}
        valueOf={valueOf}
        errors={state?.errors}
        live={live}
        draft={draft}
        onSuggest={handleSuggest}
        footer={
          // 説明と注意書きは別の段落にして、左寄せで1行ずつ読めるようにする
          <div className="flex flex-col gap-1 text-left text-xs text-zinc-500">
            <p>「提案」ボタンは、いま入力されている値から計算して、その欄を埋めるだけです。まだ保存されません。</p>
            <p>確認して、必要なら直してから「保存」を押してください。</p>
            <p className="text-zinc-400">計算は一般的な式による目安で、医療上の指示ではありません（18 歳以上が対象です）。</p>
          </div>
        }
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        <Link href="/profile" className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

function Group({
  title,
  fields,
  valueOf,
  errors,
  live,
  draft,
  onSuggest,
  footer,
}: {
  title: string;
  fields: FieldDef[];
  valueOf: (name: ProfileField) => string;
  errors: Partial<Record<ProfileField, string>> | undefined;
  live: FormValues;
  draft?: Draft | null;
  onSuggest?: (field: SuggestableField) => void;
  footer?: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium text-zinc-500">{title}</legend>
      {fields.map((field) => {
        const suggestable = SUGGESTABLE_FIELDS.find((name) => name === field.name);
        return (
          <Field
            key={field.name}
            field={field}
            value={valueOf(field.name)}
            error={errors?.[field.name]}
            live={live}
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
        );
      })}
      {footer}
    </fieldset>
  );
}

type Suggestion = { note: string | undefined; error: string | undefined; onSuggest: () => void };

function Field({
  field,
  value,
  error,
  live,
  suggestion,
}: {
  field: FieldDef;
  value: string;
  error: string | undefined;
  live: FormValues;
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
    className: "w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700",
  } as const;

  return (
    <div className="grid grid-cols-[13rem_1fr] items-start gap-x-4 gap-y-1 text-sm">
      {field.kind === "activity" || field.kind === "radio" ? (
        <span id={`${id}-label`} className="pt-1.5 text-zinc-500">
          {field.label}
        </span>
      ) : (
        <label htmlFor={id} className="pt-1.5 text-zinc-500">
          {field.label}
        </label>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {field.kind === "text" && (
            <>
              <input {...common} type="text" inputMode={field.inputMode} autoComplete="off" />
              {field.unit && <span className="text-zinc-500">{field.unit}</span>}
              {suggestion && (
                <button
                  type="button"
                  onClick={suggestion.onSuggest}
                  aria-label={`${field.label}を提案`}
                  className="ml-2 rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700"
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
        <p className="text-xs text-zinc-500">
          {field.description}
          {(field.kind === "text" || field.kind === "duration") && (
            <span className="text-zinc-400"> ({field.range})</span>
          )}
        </p>
        {suggestion?.note && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">提案の根拠: {suggestion.note}</p>
        )}
        {suggestion?.error && <p className="text-xs text-red-600">{suggestion.error}</p>}
        {error && (
          <p id={errorId} className="text-xs text-red-600">
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
  const box = "mt-1 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";

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
      <strong className="text-sm text-zinc-900 dark:text-zinc-100">
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
  const rowClass = "flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900";

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
        <span className="text-zinc-500">未選択</span>
      </label>
      {ACTIVITY_LEVEL_OPTIONS.map((option) => (
        <label key={option.value} className={rowClass}>
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={value !== "" && Number(value) === Number(option.value)}
          />
          <span className="w-16 font-medium tabular-nums">×{option.multiplier}</span>
          <span className="w-24">{option.name}</span>
          <span className="text-xs text-zinc-500">{option.detail}</span>
        </label>
      ))}
      {/* DB の値が選択肢に無いとき(AI の提案など)に、黙って「未選択」に見えて消えないよう、現在の値を出す。
          保存するには選択肢から選び直す必要がある(検証は選択肢だけを受け付ける) */}
      {value !== "" && !known && (
        <label className={rowClass}>
          <input type="radio" name={name} value={value} defaultChecked />
          <span className="w-16 font-medium tabular-nums">×{Number(value)}</span>
          <span className="text-xs text-zinc-500">現在の値。選択肢から選び直してください</span>
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
  const itemClass = "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900";

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
        <span className="text-zinc-500">未選択</span>
      </label>
    </div>
  );
}
