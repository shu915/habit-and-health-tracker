"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/button";
import { FormActions } from "@/components/form-actions";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { PairInput, timeParts } from "@/components/pair-input";
import { formatDayRange } from "@/lib/day-limits";
import { joinTimeOfDay } from "@/lib/duration";
// zod を含む day-schema.ts は、ブラウザ側のコードに入れないよう、型だけを読む
import type { DayField } from "@/lib/day-schema";

// 1 日の記録の手入力フォーム。値はすべて文字列で送り、検証と変換はサーバー側(day-schema.ts)で行う。空欄は「未入力」になる
// 今日の気づき(reflection)はこのフォームに含めない(別のパス /days/[date]/reflection)。送らないので、保存しても変わらない
export type DayFormField = Exclude<DayField, "reflection">;
export type DayFormInitial = Record<DayFormField, string>;

type FieldDef =
  | { name: DayFormField; label: string; kind: "text"; unit: string; inputMode: "decimal"; range: string; description: string }
  | { name: DayFormField; label: string; kind: "time"; description: string };

const FIELDS: FieldDef[] = [
  {
    name: "sleepBedtime",
    label: "就寝(前の夜)",
    kind: "time",
    description: "昨夜寝た時刻。睡眠を記録しないときは空のままで構いません。",
  },
  {
    name: "sleepWakeTime",
    label: "起床",
    kind: "time",
    description: "今朝起きた時刻。",
  },
  {
    name: "morningWeightKg",
    label: "朝の体重",
    kind: "text",
    unit: "kg",
    inputMode: "decimal",
    range: formatDayRange("morningWeightKg"),
    description: "起きてすぐ、トイレのあとに測った値。",
  },
  {
    name: "morningBodyFatPercent",
    label: "朝の体脂肪率",
    kind: "text",
    unit: "%",
    inputMode: "decimal",
    range: formatDayRange("morningBodyFatPercent"),
    description: "体重計の値。同じ条件で測ります(任意)。",
  },
];

type Props = {
  date: string;
  initial: DayFormInitial;
  // 日付を bind した Server Action(page.tsx から渡す)
  action: (state: DayFormState, formData: FormData) => Promise<DayFormState>;
};

export function DayForm({ date, initial, action }: Props) {
  const [state, formAction, isPending] = useActionState<DayFormState, FormData>(action, null);

  // 検証に失敗したら、送った値をそのまま残す(保存に成功すると、サーバーが詳細ページへ移動する)
  const valueOf = (name: DayFormField) => state?.values[name] ?? initial[name];

  return (
    <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
      {state && Object.keys(state.errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          入力内容を確認してください。
        </p>
      )}
      <div className="flex flex-col gap-5 rounded-lg bg-surface-raised p-4 sm:p-5">
        {FIELDS.map((field) => (
          <Field key={field.name} field={field} value={valueOf(field.name)} error={state?.errors[field.name]} />
        ))}
      </div>
      <FormActions>
        <Link href={`/days/${date}`} className={buttonClass({ variant: "secondary", size: "action" })}>
          キャンセル
        </Link>
        <button type="submit" disabled={isPending} className={buttonClass({ size: "action" })}>
          {isPending ? "保存中..." : "保存"}
        </button>
      </FormActions>
    </form>
  );
}

function Field({ field, value, error }: { field: FieldDef; value: string; error: string | undefined }) {
  const id = `day-${field.name}`;
  const errorId = `${id}-error`;
  const common = {
    id,
    name: field.name,
    defaultValue: value,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    className: "rounded-md border border-line bg-surface-raised px-3 py-2 text-[15px] text-ink",
  } as const;

  return (
    <div className="grid items-start gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
      <label htmlFor={id} className="pt-2 text-ink-muted">
        {field.label}
      </label>
      <div className="flex min-w-0 flex-col gap-1">
        {field.kind === "text" && (
          <div className="flex flex-wrap items-center gap-2">
            <input {...common} type="text" inputMode={field.inputMode} autoComplete="off" className={`${common.className} w-28`} />
            <span className="text-ink-muted">{field.unit}</span>
          </div>
        )}
        {field.kind === "time" && (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        )}
        <p className="text-xs text-ink-muted">
          {field.description}
          {field.kind === "text" && <span className="text-ink-subtle"> ({field.range})</span>}
        </p>
        {error && (
          <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
