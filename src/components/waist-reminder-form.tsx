"use client";

import { useActionState } from "react";
import type { WaistFormState } from "@/app/(app)/profile/actions";
import { buttonClass } from "@/components/button";

// 月末の催促の帯の中の、ウエストを更新するフォーム。値は文字列で送り、検証はサーバー側(profile-schema.ts)で行う。
// 初期値は今のウエスト(変わらなければ、そのまま「保存」で、今月は測ったことになる)
export function WaistReminderForm({ current, action }: { current: string | null; action: (state: WaistFormState, formData: FormData) => Promise<WaistFormState> }) {
  const [state, formAction, isPending] = useActionState<WaistFormState, FormData>(action, null);

  return (
    <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="waist-reminder" className="text-zinc-700 dark:text-zinc-300">
        ウエスト
      </label>
      <input
        id="waist-reminder"
        name="currentWaistCm"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={state?.value ?? current ?? ""}
        aria-invalid={state?.error ? true : undefined}
        aria-describedby={state?.error ? "waist-reminder-error" : undefined}
        className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
      />
      <span className="text-zinc-500">cm</span>
      <button type="submit" disabled={isPending} className={buttonClass()}>
        {isPending ? "保存中..." : "保存"}
      </button>
      {state?.error && (
        <p id="waist-reminder-error" role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
