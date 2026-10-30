"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { formatDayRange } from "@/lib/day-limits";
// zod を含む day-schema.ts は、ブラウザ側のコードに入れないよう、型だけを読む
import type { DayField } from "@/lib/day-schema";

// 1 日の記録の手入力フォーム。値はすべて文字列で送り、検証と変換はサーバー側(day-schema.ts)で行う。空欄は「未入力」になる
export type DayFormInitial = Record<DayField, string>;

type FieldDef =
  | { name: DayField; label: string; kind: "text"; unit: string; inputMode: "decimal"; range: string; description: string }
  | { name: DayField; label: string; kind: "textarea"; description: string };

const FIELDS: FieldDef[] = [
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
  {
    name: "reflection",
    label: "夜の振り返り",
    kind: "textarea",
    description: "今日あったこと、感じたことを自由に。",
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
  const valueOf = (name: DayField) => state?.values[name] ?? initial[name];

  return (
    <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
      {state && Object.keys(state.errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600">
          入力内容を確認してください。
        </p>
      )}
      <div className="flex flex-col gap-4">
        {FIELDS.map((field) => (
          <Field key={field.name} field={field} value={valueOf(field.name)} error={state?.errors[field.name]} />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        <Link href={`/days/${date}`} className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
          キャンセル
        </Link>
      </div>
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
    className: "rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700",
  } as const;

  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-x-4 gap-y-1 text-sm">
      <label htmlFor={id} className="pt-1.5 text-zinc-500">
        {field.label}
      </label>
      <div className="flex flex-col gap-1">
        {field.kind === "text" && (
          <div className="flex items-center gap-2">
            <input {...common} type="text" inputMode={field.inputMode} autoComplete="off" className={`${common.className} w-28`} />
            <span className="text-zinc-500">{field.unit}</span>
          </div>
        )}
        {field.kind === "textarea" && <textarea {...common} rows={8} className={`${common.className} w-full max-w-xl`} />}
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
