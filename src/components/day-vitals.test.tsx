// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DayVitals } from "./day-vitals";

afterEach(cleanup);

const filled = { sleepBedtime: "23:30", sleepWakeTime: "06:30", morningWeightKg: "70.50", morningBodyFatPercent: "22.5" };
const empty = { sleepBedtime: null, sleepWakeTime: null, morningWeightKg: null, morningBodyFatPercent: null };

describe("DayVitals", () => {
  it("睡眠の枠に、睡眠時間と中間時刻(大きく)と、就寝・起床(小さく)を出す", () => {
    render(<DayVitals date="2026-11-04" day={filled} />);
    const sleep = within(screen.getByRole("region", { name: "睡眠" }));
    expect(sleep.getByText("7時間")).toBeTruthy();
    expect(sleep.getByText("3時")).toBeTruthy(); // 中間時刻 03:00
    expect(sleep.getByText("23時30分")).toBeTruthy();
    expect(sleep.getByText("6時30分")).toBeTruthy();
    expect(sleep.getByText("7時間").className).toContain("text-2xl"); // 大きい
    expect(sleep.getByText("23時30分").className).not.toContain("text-2xl"); // 小さい
  });

  it("朝の体の枠に、体重と体脂肪率を出す", () => {
    render(<DayVitals date="2026-11-04" day={filled} />);
    const body = within(screen.getByRole("region", { name: "朝の体" }));
    expect(body.getByText("70.50 kg")).toBeTruthy();
    expect(body.getByText("22.5 %")).toBeTruthy();
  });

  it("未入力の項目は「未入力」と出す。就寝か起床が欠けると、睡眠時間と中間時刻も未入力", () => {
    render(<DayVitals date="2026-11-04" day={{ ...empty, sleepBedtime: "23:30" }} />);
    // 睡眠時間・中間時刻・起床・体重・体脂肪率
    expect(screen.getAllByText("未入力")).toHaveLength(5);
  });

  it("広い画面で左右に並べる(睡眠が左、朝の体が右)", () => {
    render(<DayVitals date="2026-11-04" day={filled} />);
    const sleep = screen.getByRole("region", { name: "睡眠" });
    const body = screen.getByRole("region", { name: "朝の体" });
    expect(sleep.parentElement?.className).toContain("md:grid-cols-2");
    expect(sleep.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("見出し「朝の記録」の右に、その日の編集ページへのボタンを出す。朝の項目が 1 つでもあれば「編集」、無ければ「記録する」", () => {
    const { rerender } = render(<DayVitals date="2026-11-04" day={filled} />);
    expect(screen.getByRole("heading", { name: "朝の記録" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "編集" }).getAttribute("href")).toBe("/days/2026-11-04/edit");

    rerender(<DayVitals date="2026-11-04" day={{ ...empty, morningWeightKg: "70.50" }} />);
    expect(screen.getByRole("link", { name: "編集" })).toBeTruthy();

    rerender(<DayVitals date="2026-11-04" day={empty} />); // 食事だけの日(行はあるが、朝の項目は空)
    expect(screen.getByRole("link", { name: "記録する" }).getAttribute("href")).toBe("/days/2026-11-04/edit");
  });

  it("その日の行が無いときは、枠を出さず、案内と「記録する」だけ出す", () => {
    render(<DayVitals date="2026-11-04" day={null} />);
    expect(screen.getByText("この日の記録はまだありません。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "記録する" }).getAttribute("href")).toBe("/days/2026-11-04/edit");
    expect(screen.queryByRole("region", { name: "睡眠" })).toBeNull();
  });
});
