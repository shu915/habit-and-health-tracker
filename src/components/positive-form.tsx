"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PositiveFormState } from "@/app/(app)/days/[date]/positive/actions";
import { buttonClass } from "@/components/button";
import { FormActions } from "@/components/form-actions";
import { POSITIVE_BODY_MAX_LENGTH } from "@/lib/positive-limits";
// zod を含む positive-schema.ts は、ブラウザ側のコードに入れないよう、型だけを読む
import type { PositiveField } from "@/lib/positive-schema";

// 「良かったこと」(ポジティブ3行日記)のフォーム。1 行の欄が 3 つ。値は文字列で送り、検証はサーバー側(positive-schema.ts)で行う。
// 空の欄は、書かなかったものとして保存しない
export type PositiveFormInitial = Record<PositiveField, string>;

export const EMPTY_POSITIVE: PositiveFormInitial = { body1: "", body2: "", body3: "" };

type Props = {
  date: string;
  initial: PositiveFormInitial;
  action: (state: PositiveFormState, formData: FormData) => Promise<PositiveFormState>;
};

// 入力欄の例(プレースホルダー)。保存される値ではない。「できごと。それで感じたこと」の型にそろえる
const EXAMPLES: Record<PositiveField, string> = {
  body1: "例: 味噌汁がおいしかった。手間をかけて取っただしが効いて、おいしさを実感できた",
  body2: "例: 雲ひとつない青空だった。秋を感じられて、気分が晴れた",
  body3: "例: 前の日に準備した資料を、同僚が褒めてくれた。努力が報われた",
};

const FIELDS: PositiveField[] = ["body1", "body2", "body3"];

export function PositiveForm({ date, initial, action }: Props) {
  const [state, formAction, isPending] = useActionState<PositiveFormState, FormData>(action, null);

  // 検証に失敗したら、送った値をそのまま残す(保存に成功すると、サーバーが詳細ページへ移動する)
  const valueOf = (name: PositiveField) => state?.values[name] ?? initial[name];
  const errorOf = (name: PositiveField) => state?.errors[name];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        今日あった良かったことを、3 つまで書きます。良かったことに加えて、なぜそう感じたかも書くと、気分を整える効果が高まりやすいと言われています(個人差があります)。
        1 つだけの日でも、書かない日でも構いません。医療上の効果を約束するものではありません。内容は AI には送りません。
      </p>

      <form key={state?.submittedAt ?? "initial"} action={formAction} className="flex flex-col gap-6">
        {state && Object.keys(state.errors).length > 0 && (
          <p role="alert" className="text-sm text-red-600">
            入力内容を確認してください。
          </p>
        )}

        <div className="flex flex-col gap-4">
          {FIELDS.map((name, index) => {
            const error = errorOf(name);
            const id = `positive-${name}`;
            return (
              <div key={name} className="flex flex-col gap-1 text-sm">
                <label htmlFor={id} className="text-zinc-500">
                  {index + 1} つ目
                </label>
                {/* 3 行分の高さで固定する(拡大縮小はさせない)。field-sizing: content は rows を無視して 1 行になるので使わない */}
                <textarea
                  id={id}
                  name={name}
                  rows={3}
                  autoComplete="off"
                  defaultValue={valueOf(name)}
                  placeholder={EXAMPLES[name]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className="w-full resize-none rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700"
                />
                <p className="text-xs text-zinc-500">{POSITIVE_BODY_MAX_LENGTH} 文字まで</p>
                {error && (
                  <p id={`${id}-error`} className="text-xs text-red-600">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
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
    </div>
  );
}
