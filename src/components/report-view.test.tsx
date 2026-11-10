// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportContent } from "@/lib/report-content";
import type { StoredReport } from "@/lib/reports";
import type { TrendInputs } from "@/lib/trend-views";
import { ReportView } from "./report-view";

afterEach(cleanup);

const dates = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
const snapshot: TrendInputs = {
  dates,
  finishedBefore: "2026-11-05",
  rows: dates.map((date) => ({ date, morningWeightKg: "70.00", morningBodyFatPercent: "20.0", sleepBedtime: "01:00", sleepWakeTime: "07:00", profileTargetCalories: 2000, profileActivityLevel: "1.375" })),
  intake: dates.map((date) => ({ date, kcal: 1900, mealCount: 3 })),
  exercises: [{ date: "2026-10-31", type: "walk", intensity: "normal", minutes: 30 }],
  weightBeforeFrom: null,
  bodyFatBeforeFrom: null,
  targetBeforeFrom: null,
  profile: { targetCalories: 2000, currentWeightKg: "70.00", currentBodyFatPercent: "20.0", gender: "male", age: 40, heightCm: "175", activityLevel: "1.375", targetSleepMidpoint: "03:15" },
};
const content: ReportContent = {
  sections: [
    { key: "nutrition", headline: "食事は目標のまわりです", findings: [{ text: "平日のほうが少し多めでした。", dates: ["2026-10-30", "2026-11-02"] }] },
    { key: "sleep", headline: "睡眠は安定しています", findings: [{ text: "毎日同じ時間に寝ています。", dates: [] }] },
    { key: "exercise", headline: "10/31 に歩いていました", findings: [] },
  ],
  overall: {
    summary: "睡眠のゴールドバッジ、おめでとうございます。",
    good_points: ["記録を続けられています"],
    watch_points: ["夜の食事が少し遅めです"],
    discoveries: [{ title: "平日のほうが多い", text: "平日は 2,585 kcal、休日は 1,975 kcal でした。", dates: ["2026-10-30"] }],
    next_steps: [{ text: "朝に歩いてみましょう", sections: ["exercise", "sleep"] }],
  },
};
const report: StoredReport = {
  id: 1,
  kind: "four-weeks",
  periodStart: "2026-10-29",
  periodEnd: "2026-11-04",
  createdAt: new Date("2026-11-05T01:00:00Z"),
  badges: [
    { key: "record", tier: "silver", passed: 6, judged: 7, unit: "day" },
    { key: "sleep", tier: "gold", passed: 7, judged: 7, unit: "day" },
    { key: "exercise", tier: "bronze", passed: 1, judged: 1, unit: "week" },
  ],
  content,
  snapshot,
  consentVersion: 1,
  status: "done",
  errorMessage: null,
  elapsedSeconds: 0,
};

describe("ReportView", () => {
  it("題名(種類と期間)、断り、取れたバッジ(項目と段階の言葉つき)を出す。評価(成績・点数)は出さない", () => {
    render(<ReportView report={report} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("直近 4 週間(10/29〜11/4)");
    expect(screen.getAllByText(/医療上の指示ではありません/).length).toBeGreaterThan(0); // 題名の下と、バッジの条件の 2 か所
    const badges = within(screen.getByRole("region", { name: "今期のバッジ" }));
    expect(badges.getByText("睡眠 ゴールド")).toBeTruthy();
    // バッジの絵(飾り。名前は隣の文字)。種類と段階に合う SVG を指す
    const pictures = within(screen.getByRole("region", { name: "今期のバッジ" })).getAllByRole("presentation") as HTMLImageElement[];
    expect(pictures.some((img) => img.getAttribute("src")?.endsWith("/badges/sleep-gold.svg"))).toBe(true);
    expect(pictures.some((img) => img.getAttribute("src")?.endsWith("/badges/record-silver.svg"))).toBe(true);
    expect(badges.getByText("運動 ブロンズ")).toBeTruthy();
    // 文は、折り返しのために、文節ごとの塊に分けてある(見える文字は、つながった 1 文)
    const regionText = screen.getByRole("region", { name: "今期のバッジ" }).textContent ?? "";
    expect(regionText).toContain("7 日のうち 7 日が範囲に収まりました");
    // 継続は、範囲ではなく、記録があった日の数(「記録がありました」)。先頭に出る
    expect(badges.getByText("継続 シルバー")).toBeTruthy();
    expect(regionText).toContain("7 日のうち 6 日に記録がありました");
    expect(regionText.indexOf("継続 シルバー")).toBeLessThan(regionText.indexOf("睡眠 ゴールド"));
    expect(regionText).toContain("1 週のうち 1 週が範囲に収まりました");
    expect(document.body.textContent).not.toMatch(/成績|点数|rating/);
  });

  it("バッジが無いときは、節ごと出さない(無い人にだけ「無い」と見せない。条件は /reports で読める)", () => {
    render(<ReportView report={{ ...report, badges: [] }} />);
    expect(screen.queryByRole("region", { name: "今期のバッジ" })).toBeNull();
    expect(screen.queryByText(/届いた項目はありませんでした/)).toBeNull();
    expect(screen.queryByText("バッジの条件")).toBeNull();
  });

  it("項目は、決まった順(睡眠 → 食事と栄養 → 運動)に並ぶ。気づきには、注目の日を日付で書く(色だけに頼らない)", () => {
    render(<ReportView report={report} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("睡眠")).toBeLessThan(headings.indexOf("食事と栄養"));
    expect(headings.indexOf("食事と栄養")).toBeLessThan(headings.indexOf("運動"));
    expect(screen.getByText("平日のほうが少し多めでした。")).toBeTruthy();
    expect(screen.getByText("注目の日: 10/30、11/2")).toBeTruthy();
    expect(screen.queryByText("注目の日: ")).toBeNull(); // 日付が無い気づきには、出さない
  });

  it("印刷(PDF)では、グラフのある項目(睡眠・体・食事)と、運動(文章だけの項目の先頭)が、新しいページから始まる。そのほかの文章だけの項目は、続けて出る", () => {
    const withText: ReportContent = {
      ...content,
      sections: [...content.sections, { key: "mind", headline: "気持ちは安定", findings: [] }, { key: "habit", headline: "記録は続いている", findings: [] }],
    };
    render(<ReportView report={{ ...report, content: withText }} />);
    const startsPage = (name: string) => screen.getByRole("region", { name }).className.includes("print:break-before-page");
    expect(startsPage("睡眠")).toBe(true);
    expect(startsPage("食事と栄養")).toBe(true);
    expect(startsPage("運動")).toBe(true);
    expect(startsPage("気持ち・日記")).toBe(false);
    expect(startsPage("記録の習慣")).toBe(false);
  });

  it("印刷(PDF)では、体重と体脂肪率のグラフを左右に並べる(紙の幅は、画面の横並びの幅に足りないため、印刷でも指定する)", () => {
    render(<ReportView report={{ ...report, content: { ...content, sections: [{ key: "body", headline: "体重は横ばい", findings: [] }] } }} />);
    const grid = screen.getByRole("region", { name: "体" }).querySelector("div.grid");
    expect(grid?.className).toContain("print:grid-cols-2");
  });

  it("グラフは、保存した数字から描き直す(睡眠・カロリー・差のカードが出る)。運動の項目は、動いた日数を文で出す(日付の一覧は出さない)", () => {
    render(<ReportView report={report} />);
    expect(screen.getByRole("heading", { level: 2, name: "睡眠" })).toBeTruthy();
    expect(screen.getAllByText("摂取カロリー").length).toBeGreaterThan(0);
    expect(screen.getAllByText("摂取 − 消費の目安").length).toBeGreaterThan(0);
    expect(screen.queryByText(/いつもより多く動いた日:/)).toBeNull();
  });

  it("運動の先頭の 1 文: 3 日以上のとき「N 日のうち M 日で…」を出す。1〜2 日のときは、見出しや気づきと重なるので出さない。0 日は、記録が無いと出す", () => {
    const withExerciseDays = (days: string[]) => ({ ...report, snapshot: { ...snapshot, exercises: days.map((date) => ({ date, type: "walk", intensity: "normal", minutes: 30 })) } });
    const { unmount: u1 } = render(<ReportView report={withExerciseDays(["2026-10-30", "2026-10-31", "2026-11-01"])} />);
    expect(screen.getByText("7 日のうち 3 日で、いつもより多く動いた記録があります。")).toBeTruthy();
    u1();
    const { unmount: u2 } = render(<ReportView report={withExerciseDays(["2026-10-31"])} />);
    expect(screen.queryByText(/日のうち 1 日で/)).toBeNull();
    u2();
    render(<ReportView report={withExerciseDays([])} />);
    expect(screen.getByText("いつもより多く動いた記録は、この期間にありませんでした。")).toBeTruthy();
  });

  it("総合評価: まとめ・良かったこと・気づいておきたいこと・見つかったこと・次の 1 歩。次の 1 歩は、関連する項目への印(リンク)つき", () => {
    render(<ReportView report={report} />);
    const overall = within(screen.getByRole("region", { name: "総合評価" }));
    expect(overall.getByText("睡眠のゴールドバッジ、おめでとうございます。")).toBeTruthy();
    expect(overall.getByText("記録を続けられています")).toBeTruthy();
    expect(overall.getByText("夜の食事が少し遅めです")).toBeTruthy();
    expect(overall.getByText("平日のほうが多い")).toBeTruthy();
    expect(overall.getByText("朝に歩いてみましょう", { exact: false })).toBeTruthy();
    expect(overall.getByRole("link", { name: "運動" }).getAttribute("href")).toBe("#section-exercise");
    expect(overall.getByRole("link", { name: "睡眠" }).getAttribute("href")).toBe("#section-sleep");
  });

  it("文章が読めないとき・グラフの元の数字が読めないときも、落ちずに、その旨を出す", () => {
    render(<ReportView report={{ ...report, content: null }} />);
    expect(screen.getByText("レポートの文章を読み込めませんでした。")).toBeTruthy();
    cleanup();
    render(<ReportView report={{ ...report, snapshot: null }} />);
    expect(screen.getAllByText("グラフの元の数字が読めないため、グラフは出せません。").length).toBeGreaterThan(0);
  });

  it("バッジの条件を、画面で読める(睡眠 6 時間・目標の ±1 時間、カロリー 85〜115%、体重のバッジは贈らない)", () => {
    render(<ReportView report={report} />);
    expect(screen.getByText(/睡眠時間が 6 時間以上、かつ、睡眠の中間時刻が、プロフィールの目標の ±1 時間以内/)).toBeTruthy();
    expect(screen.getByText(/目標となるカロリーの 85〜115% の日/)).toBeTruthy();
    expect(screen.getByText(/体重を減らしたことには、バッジを贈りません/)).toBeTruthy();
  });

  it("AI が同じ文を 2 回返しても、React の key が重複せず(警告が出ず)、2 つとも表示される", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const dup: StoredReport = { ...report, content: { ...content, overall: { ...content.overall, good_points: ["同じ文です", "同じ文です"], watch_points: ["同じ注意", "同じ注意"], discoveries: [{ title: "同じ見出し", text: "A", dates: [] }, { title: "同じ見出し", text: "B", dates: [] }], next_steps: [{ text: "同じ一歩", sections: [] }, { text: "同じ一歩", sections: [] }] } } };
    render(<ReportView report={dup} />);
    expect(screen.getAllByText("同じ文です")).toHaveLength(2);
    expect(screen.getAllByText("同じ見出し")).toHaveLength(2);
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("same key");
    errorLog.mockRestore();
  });
  it("長期レポート(四半期): 題名は期間の名前。グラフは、日ごとではなく、週ごと(1 本 = 1 週間)。バッジが無ければ、バッジの節を出さない", () => {
    const longTerm: StoredReport = { ...report, kind: "quarterly", periodStart: "2026-07-01", periodEnd: "2026-09-30", badges: [] };
    render(<ReportView report={longTerm} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("2026 年 7〜9 月(第 3 四半期)");
    expect(screen.getAllByText(/1 本が 1 週間\(月曜始まり\)/).length).toBeGreaterThan(0); // 睡眠・体重・体脂肪率・摂取
    expect(screen.getByText("運動した日数")).toBeTruthy(); // 運動は、週ごとの日数の棒
    expect(screen.queryByText(/7 日移動平均/)).toBeNull(); // 日ごとのグラフの注記は出ない
    expect(screen.queryByRole("region", { name: "今期のバッジ" })).toBeNull();
    expect(screen.queryByText(/日のうち 1 日で、いつもより多く動いた記録があります/)).toBeNull(); // 運動の先頭の 1 文は、短い期間のもの
  });

  it("長期レポート(年)の題名は「2026 年」", () => {
    render(<ReportView report={{ ...report, kind: "yearly", periodStart: "2026-01-01", periodEnd: "2026-12-31", badges: [] }} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("2026 年");
  });
});
