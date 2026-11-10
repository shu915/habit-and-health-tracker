// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildSleepTrend, trendDates } from "@/lib/trend";
import { SleepCard } from "./sleep-card";

afterEach(cleanup);

describe("SleepCard", () => {
  it("図の説明は、図の向き(就寝が下、起床が上)と合っている(向きを変えたときに、説明が古いまま残った)", () => {
    const points = buildSleepTrend(trendDates("2026-11-10", 7), new Map([["2026-11-10", { bedtime: "01:00", wakeTime: "07:00" }]]));
    render(<SleepCard points={points} syncId="t" />);
    expect(screen.getByText(/帯は就寝\(下\)から起床\(上\)まで/)).toBeTruthy();
    expect(screen.queryByText(/就寝\(上\)/)).toBeNull();
  });
});
