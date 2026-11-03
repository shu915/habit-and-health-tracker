// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseFormState } from "@/app/(app)/days/[date]/exercises/actions";
import { EMPTY_EXERCISE, ExerciseForm } from "./exercise-form";

// 本物の動きと同じ形で確かめる: サーバーが先に HTML を作り(今の時刻は分からないので空)、ブラウザが引き継いだあとに、今の時刻が入る。
// 引き継ぎで HTML の食い違い(ハイドレーションの警告)が起きないことも、onRecoverableError で確かめる
const action = async (): Promise<ExerciseFormState> => null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12, 5));
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function hydrate(date: string, now: Date = new Date(2026, 9, 30, 12, 5), defaultToNow = true) {
  vi.setSystemTime(now);
  const element = <ExerciseForm date={date} initial={EMPTY_EXERCISE} action={action} defaultToNow={defaultToNow} />;
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(element); // サーバーの描画(時刻は空)
  const input = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const serverHours = input("開始時刻（時）").value;

  const onRecoverableError = vi.fn();
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError });
  });
  return { serverHours, hours: () => input("開始時刻（時）"), minutes: () => input("開始時刻（分）"), onRecoverableError };
}

describe("ExerciseForm: サーバーの HTML を引き継いだあとの、開始時刻の初期値", () => {
  it("サーバーの描画では空で、ブラウザが引き継いだあとに、今日なら今の時刻が入る。HTML の食い違いは起きない", async () => {
    const { serverHours, hours, minutes, onRecoverableError } = await hydrate("2026-10-30");

    expect(serverHours).toBe(""); // サーバーは、今の時刻を知らない
    expect(hours().value).toBe("12");
    expect(minutes().value).toBe("5");
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it("別の日の画面なら、引き継いだあとも空のまま", async () => {
    const { hours, minutes, onRecoverableError } = await hydrate("2026-10-01");
    expect(hours().value).toBe("");
    expect(minutes().value).toBe("");
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it("深夜(午前 3 時より前)は、前の日の画面にだけ、24 時以降の時刻が入る: 01:30 → 前日の 25:30", async () => {
    const { hours, minutes } = await hydrate("2026-10-29", new Date(2026, 9, 30, 1, 30));
    expect(hours().value).toBe("25");
    expect(minutes().value).toBe("30");
  });

  it("深夜でも、今日(カレンダーの日付)の画面では、時刻は空のまま", async () => {
    const { hours } = await hydrate("2026-10-30", new Date(2026, 9, 30, 1, 30));
    expect(hours().value).toBe("");
  });

  it("直すとき(defaultToNow なし)は、引き継いだあとも空のまま", async () => {
    const { hours, minutes, onRecoverableError } = await hydrate("2026-10-30", new Date(2026, 9, 30, 12, 5), false);
    expect(hours().value).toBe("");
    expect(minutes().value).toBe("");
    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
