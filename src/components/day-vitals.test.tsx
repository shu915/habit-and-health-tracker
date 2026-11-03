// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DayVitals } from "./day-vitals";

afterEach(cleanup);

const filled = { sleepBedtime: "23:30", sleepWakeTime: "06:30", morningWeightKg: "70.50", morningBodyFatPercent: "22.5" };
const empty = { sleepBedtime: null, sleepWakeTime: null, morningWeightKg: null, morningBodyFatPercent: null };

describe("DayVitals", () => {
  it("睡眠の枠に、睡眠時間と中間時刻(大きく)と、就寝・起床(小さく)を出す", () => {
    render(<DayVitals day={filled} />);
    const sleep = within(screen.getByRole("region", { name: "睡眠" }));
    expect(sleep.getByText("7時間")).toBeTruthy();
    expect(sleep.getByText("3時")).toBeTruthy(); // 中間時刻 03:00
    expect(sleep.getByText("23時30分")).toBeTruthy();
    expect(sleep.getByText("6時30分")).toBeTruthy();
    expect(sleep.getByText("7時間").className).toContain("text-2xl"); // 大きい
    expect(sleep.getByText("23時30分").className).not.toContain("text-2xl"); // 小さい
  });

  it("朝の体の枠に、体重と体脂肪率を出す", () => {
    render(<DayVitals day={filled} />);
    const body = within(screen.getByRole("region", { name: "朝の体" }));
    expect(body.getByText("70.50 kg")).toBeTruthy();
    expect(body.getByText("22.5 %")).toBeTruthy();
  });

  it("未入力の項目は「未入力」と出す。就寝か起床が欠けると、睡眠時間と中間時刻も未入力", () => {
    render(<DayVitals day={{ ...empty, sleepBedtime: "23:30" }} />);
    // 睡眠時間・中間時刻・起床・体重・体脂肪率
    expect(screen.getAllByText("未入力")).toHaveLength(5);
  });

  it("広い画面で左右に並べる(睡眠が左、朝の体が右)", () => {
    render(<DayVitals day={filled} />);
    const sleep = screen.getByRole("region", { name: "睡眠" });
    const body = screen.getByRole("region", { name: "朝の体" });
    expect(sleep.parentElement?.className).toContain("md:grid-cols-2");
    expect(sleep.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
