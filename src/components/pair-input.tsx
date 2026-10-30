"use client";

import { useState } from "react";
import { splitMinutes, splitTimeOfDay } from "@/lib/duration";

export type Pair = { first: string; second: string };

// 検証に失敗して作り直すとき、送った値が不正な形("25:70" や "ab:5")でも、入力した文字を 2 つの欄に戻す(直す手がかりを消さない)
function rawParts(value: string): Pair {
  const [first = "", second = ""] = value.split(":");
  return { first: first.trim(), second: second.trim() };
}

// DB の分(文字列)を、「時間」「分」の欄の初期値にする。空は空欄。"時:分" の形(不正な入力)はそのまま戻す
export function durationParts(value: string): Pair {
  if (/^\d+$/.test(value)) {
    const { hours, minutes } = splitMinutes(Number(value));
    return { first: String(hours), second: String(minutes) };
  }
  return value.includes(":") ? rawParts(value) : { first: "", second: "" };
}

// DB の "HH:MM" を、「時」「分」の欄の初期値にする("03:15" → 3 と 15)。空は空欄。形が違う値("25:70")はそのまま戻す
export function timeParts(value: string): Pair {
  const parts = splitTimeOfDay(value);
  if (parts) return { first: String(parts.hours), second: String(parts.minutes) };
  return value.includes(":") ? rawParts(value) : { first: "", second: "" };
}

// 「7 時間 30 分」「3 時 15 分」のように、2 つの小さな欄で入力する部品(睡眠時間・睡眠の中間時刻・就寝と起床で共通)。
// 送るのは DB の形(分 / "HH:MM")に変換した値(裏の hidden の入力)で、見えている 2 つの欄は送らない(name を付けない)
export function PairInput({
  id,
  name,
  label,
  units,
  initial,
  join,
  error,
  errorId,
}: {
  id: string;
  name: string;
  label: string;
  units: readonly [string, string];
  initial: Pair;
  join: (first: string, second: string) => string;
  error: string | undefined;
  errorId: string;
}) {
  const [first, setFirst] = useState(initial.first);
  const [second, setSecond] = useState(initial.second);
  const inputClass = "w-16 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 dark:border-zinc-700";
  const invalid = error ? true : undefined;
  const describedBy = error ? errorId : undefined;

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={first}
        onChange={(event) => setFirst(event.target.value)}
        aria-label={`${label}（${units[0]}）`}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={inputClass}
      />
      <span className="text-zinc-500">{units[0]}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={second}
        onChange={(event) => setSecond(event.target.value)}
        aria-label={`${label}（${units[1]}）`}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={inputClass}
      />
      <span className="text-zinc-500">{units[1]}</span>
      <input type="hidden" name={name} value={join(first, second)} />
    </>
  );
}
