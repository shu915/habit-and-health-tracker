"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import type { ExerciseFormState } from "@/app/(app)/days/[date]/exercises/actions";
import { buttonClass } from "@/components/button";
import { EXERCISE_INTENSITIES, EXERCISE_TYPES } from "@/lib/exercise";
import { EXERCISE_MEMO_MAX_LENGTH, formatExerciseRange } from "@/lib/exercise-limits";
// zod を含む exercise-schema.ts は、ブラウザ側のコードに入れないよう、型だけを読む
import type { ExerciseField } from "@/lib/exercise-schema";

// 運動の追加・編集フォーム。値はすべて文字列で送り、検証はサーバー側(exercise-schema.ts)で行う。消費カロリーは保存後に計算して出す
export type ExerciseFormInitial = Record<ExerciseField, string>;

export const EMPTY_EXERCISE: ExerciseFormInitial = { type: "", intensity: "", minutes: "", memo: "" };

type Props = {
  date: string;
  initial: ExerciseFormInitial;
  // 追加(日付を bind)か、直す(id を bind)かの Server Action(page.tsx から渡す)
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  // 直すときだけ渡す、削除の Server Action(id を bind)
  deleteAction?: () => Promise<void>;
};

const INPUT_CLASS = "rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700";

export function ExerciseForm({ date, initial, action, deleteAction }: Props) {
  const [state, formAction, isPending] = useActionState<ExerciseFormState, FormData>(action, null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const busy = isPending || deleting;

  // 検証に失敗したら、送った値をそのまま残す(保存に成功すると、サーバーが詳細ページへ移動する)
  const valueOf = (name: ExerciseField) => state?.values[name] ?? initial[name];
  const errorOf = (name: ExerciseField) => state?.errors[name];

  return (
    <div className="flex flex-col gap-6">
      {/* 二重に数えないための注意。ふだんの運動は、プロフィールの活動係数にすでに含まれている */}
      <p className="max-w-xl rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        ふだんの散歩や軽い運動は、プロフィールの活動係数に、すでに含まれています。いつもどおりの運動は、記録しても、1 日の消費には足されません(二重に数えないため)。
        <strong className="font-semibold">いつもより多く動いた分だけ</strong>、記録してください。
      </p>

      <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
        {state?.message ? (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        ) : (
          state &&
          Object.keys(state.errors).length > 0 && (
            <p role="alert" className="text-sm text-red-600">
              入力内容を確認してください。
            </p>
          )
        )}
        <div className="flex flex-col gap-4">
          <Row name="type" label="種類" error={errorOf("type")}>
            <select id="exercise-type" name="type" defaultValue={valueOf("type")} {...describe("type", errorOf("type"))} className={INPUT_CLASS}>
              <option value="">選んでください</option>
              {/* 一覧にない値(のちに廃止した種類など)は、現在の値として残し、選び直しにならないようにする */}
              {!EXERCISE_TYPES.some((type) => type.key === valueOf("type")) && valueOf("type") !== "" && <option value={valueOf("type")}>{valueOf("type")}</option>}
              {EXERCISE_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </Row>
          <Row name="intensity" label="強さ" error={errorOf("intensity")}>
            <select id="exercise-intensity" name="intensity" defaultValue={valueOf("intensity")} {...describe("intensity", errorOf("intensity"))} className={INPUT_CLASS}>
              <option value="">選んでください</option>
              {!EXERCISE_INTENSITIES.some((intensity) => intensity.key === valueOf("intensity")) && valueOf("intensity") !== "" && <option value={valueOf("intensity")}>{valueOf("intensity")}</option>}
              {EXERCISE_INTENSITIES.map((intensity) => (
                <option key={intensity.key} value={intensity.key}>
                  {intensity.label}
                </option>
              ))}
            </select>
          </Row>
          <Row name="minutes" label="時間" error={errorOf("minutes")} description={`分で入力します(${formatExerciseRange("minutes")})。`}>
            <div className="flex items-center gap-2">
              <input
                id="exercise-minutes"
                name="minutes"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={valueOf("minutes")}
                {...describe("minutes", errorOf("minutes"))}
                className={`${INPUT_CLASS} w-28`}
              />
              <span className="text-zinc-500">分</span>
            </div>
          </Row>
          <Row name="memo" label="メモ" error={errorOf("memo")} description={`自分用のメモ(任意、${EXERCISE_MEMO_MAX_LENGTH} 文字まで)。AI には送りません。`}>
            <input
              id="exercise-memo"
              name="memo"
              type="text"
              autoComplete="off"
              defaultValue={valueOf("memo")}
              {...describe("memo", errorOf("memo"))}
              className={`${INPUT_CLASS} w-full max-w-xl`}
            />
          </Row>
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={buttonClass()}>
            {isPending ? "保存中..." : "保存"}
          </button>
          <Link href={`/days/${date}`} className={buttonClass({ variant: "secondary" })}>
            キャンセル
          </Link>
          {deleteAction && !confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className={`${buttonClass({ variant: "secondary" })} ml-auto`}>
              削除
            </button>
          )}
        </div>
      </form>

      {deleteAction && confirmingDelete && (
        <div role="alertdialog" aria-label="削除の確認" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 p-3 text-sm dark:border-red-900">
          <span>この運動を削除します。元に戻せません。よろしいですか。</span>
          <button type="button" onClick={() => startDelete(() => deleteAction())} disabled={busy} className={buttonClass()}>
            削除する
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className={buttonClass({ variant: "secondary" })}>
            やめる
          </button>
        </div>
      )}
    </div>
  );
}

function describe(name: ExerciseField, error: string | undefined) {
  return { "aria-invalid": error ? true : undefined, "aria-describedby": error ? `exercise-${name}-error` : undefined } as const;
}

function Row({ name, label, error, description, children }: { name: ExerciseField; label: string; error: string | undefined; description?: string; children: React.ReactNode }) {
  const controlId = { type: "exercise-type", intensity: "exercise-intensity", minutes: "exercise-minutes", memo: "exercise-memo" }[name];
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-x-4 gap-y-1 text-sm">
      <label htmlFor={controlId} className="pt-1.5 text-zinc-500">
        {label}
      </label>
      <div className="flex flex-col gap-1">
        {children}
        {description && <p className="text-xs text-zinc-500">{description}</p>}
        {error && (
          <p id={`exercise-${name}-error`} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
