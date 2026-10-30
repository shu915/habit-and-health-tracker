"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveProfileAction, type ProfileFormState } from "@/app/(app)/profile/actions";
import { ACTIVITY_LEVEL_OPTIONS, GENDER_OPTIONS } from "@/lib/profile-options";
import { formatRange } from "@/lib/profile-limits";
import type { ProfileField } from "@/lib/profile-schema";

// プロフィールの手入力フォーム(見た目はこれから整える)。
// 値はすべて文字列で送り、検証と変換はサーバー側(profile-schema.ts)で行う。空欄は「未入力」になる
export type ProfileFormInitial = Record<ProfileField, string>;

// description: 何の値で、どう決めればよいか(欄の下に出す説明)。range: 入力できる範囲
type FieldBase = { name: ProfileField; label: string; description: string; required?: boolean };
type FieldDef =
  | (FieldBase & { kind: "text"; unit?: string; inputMode: "decimal" | "numeric"; range: string })
  | (FieldBase & { kind: "time" })
  | (FieldBase & { kind: "select"; options: readonly { value: string; label: string }[] });

const BODY_FIELDS: FieldDef[] = [
  { name: "gender", label: "性別", kind: "select", options: GENDER_OPTIONS, description: "基礎代謝の計算に使います。" },
  { name: "age", label: "年齢", kind: "text", unit: "歳", inputMode: "numeric", range: formatRange("age"), description: "基礎代謝の計算に使います。" },
  { name: "heightCm", label: "身長", kind: "text", unit: "cm", inputMode: "decimal", range: formatRange("heightCm"), description: "基礎代謝の計算に使います。" },
  { name: "currentWeightKg", label: "現在の体重", kind: "text", unit: "kg", inputMode: "decimal", range: formatRange("currentWeightKg"), description: "今の目安の体重です。" },
  { name: "currentBodyFatPercent", label: "体脂肪率", kind: "text", unit: "%", inputMode: "decimal", range: formatRange("currentBodyFatPercent"), description: "体重計の値。毎朝同じ条件で測ります(任意)。" },
  { name: "currentWaistCm", label: "ウエスト", kind: "text", unit: "cm", inputMode: "decimal", range: formatRange("currentWaistCm"), description: "おへその高さで測ります(任意)。" },
];

const GOAL_FIELDS: FieldDef[] = [
  { name: "activityLevel", label: "活動係数", kind: "select", options: ACTIVITY_LEVEL_OPTIONS, description: "迷ったら「軽い」。消費カロリーの見積もりに使います。" },
  { name: "targetWeightKg", label: "目標体重", kind: "text", unit: "kg", inputMode: "decimal", range: formatRange("targetWeightKg"), description: "達成したい体重です。" },
  { name: "targetCalories", label: "目標カロリー", kind: "text", unit: "kcal", inputMode: "numeric", range: formatRange("targetCalories"), description: "1日に食べる量の目標です。" },
  { name: "targetProteinG", label: "目標タンパク質", kind: "text", unit: "g", inputMode: "decimal", range: formatRange("targetProteinG"), description: "1日に摂る量。目安は体重1kgあたり1〜1.6g。" },
  { name: "targetSleepMinutes", label: "睡眠の目標", kind: "text", unit: "分", inputMode: "numeric", range: formatRange("targetSleepMinutes"), required: true, description: "1晩に寝る長さ。7時間30分なら 450。" },
  { name: "targetSleepMidpoint", label: "睡眠の中間時刻", kind: "time", required: true, description: "寝た時刻と起きた時刻の真ん中。23:30〜7:00 なら 03:15。" },
];

export function ProfileForm({ initial }: { initial: ProfileFormInitial }) {
  const [state, formAction, isPending] = useActionState<ProfileFormState, FormData>(saveProfileAction, null);

  // 検証に失敗したら、送った値をそのまま残す(保存に成功すると、サーバーが /profile へ移動する)
  const valueOf = (name: ProfileField) => state?.values[name] ?? initial[name];

  return (
    <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
      {state && Object.keys(state.errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600">
          入力内容を確認してください。
        </p>
      )}
      <Group title="ボディデータ" fields={BODY_FIELDS} valueOf={valueOf} errors={state?.errors} />
      <Group title="目標値" fields={GOAL_FIELDS} valueOf={valueOf} errors={state?.errors} />
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
}: {
  title: string;
  fields: FieldDef[];
  valueOf: (name: ProfileField) => string;
  errors: Partial<Record<ProfileField, string>> | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium text-zinc-500">{title}</legend>
      {fields.map((field) => (
        <Field key={field.name} field={field} value={valueOf(field.name)} error={errors?.[field.name]} />
      ))}
    </fieldset>
  );
}

function Field({ field, value, error }: { field: FieldDef; value: string; error: string | undefined }) {
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
      <label htmlFor={id} className="pt-1.5 text-zinc-500">
        {field.label}
        {field.required && <span className="ml-1 text-xs text-red-600">必須</span>}
      </label>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {field.kind === "select" && (
            <select {...common}>
              <option value="">未選択</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {/* DB の値が選択肢に無いとき(AI の提案など)に、黙って「未選択」に見えて消えないよう、現在の値を出す。
                  保存するには選択肢から選び直す必要がある(検証は選択肢だけを受け付ける) */}
              {value !== "" && !field.options.some((option) => option.value === value) && (
                <option value={value}>{value}(現在の値。選択肢から選び直してください)</option>
              )}
            </select>
          )}
          {field.kind === "text" && (
            <>
              <input {...common} type="text" inputMode={field.inputMode} autoComplete="off" />
              {field.unit && <span className="text-zinc-500">{field.unit}</span>}
            </>
          )}
          {field.kind === "time" && <input {...common} type="time" />}
        </div>
        <p className="text-xs text-zinc-500">
          {field.description}
          {field.kind === "text" && <span className="text-zinc-400"> ({field.range})</span>}
        </p>
        {error && (
          <p id={errorId} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
