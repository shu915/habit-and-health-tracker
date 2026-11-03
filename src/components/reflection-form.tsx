"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { DayFormState } from "@/app/(app)/days/[date]/edit/actions";
import { buttonClass } from "@/components/button";
import { FormActions } from "@/components/form-actions";
import { REFLECTION_MAX_LENGTH } from "@/lib/day-limits";

// 今日の気づき(自由記入)のフォーム。朝の記録(day-form.tsx)とは別。値は文字列で送り、検証はサーバー側(day-schema.ts)で行う。空にして保存すると消える
type Props = {
  date: string;
  initial: string;
  action: (state: DayFormState, formData: FormData) => Promise<DayFormState>;
};

export function ReflectionForm({ date, initial, action }: Props) {
  const [state, formAction, isPending] = useActionState<DayFormState, FormData>(action, null);

  // 検証に失敗したら、送った値をそのまま残す(保存に成功すると、サーバーが詳細ページへ移動する)
  const value = state?.values.reflection ?? initial;
  const error = state?.errors.reflection;

  return (
    <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor="reflection" className="text-zinc-500">
          今日の気づき
        </label>
        <textarea
          id="reflection"
          name="reflection"
          rows={8}
          defaultValue={value}
          placeholder="例: 夜に食べすぎた。寝る前のお菓子が原因かも。明日は目につく所に置かないようにする"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reflection-error" : undefined}
          className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
        />
        <p className="text-xs text-zinc-500">うまくいかなかったこと、気づいたこと、明日どうするかを自由に。(良い出来事は「良かったこと」へ){REFLECTION_MAX_LENGTH} 文字まで。</p>
        {error && (
          <p id="reflection-error" role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
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
