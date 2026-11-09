import { describe, expect, it, vi } from "vitest";
import { completeJson, OpenRouterError } from "./openrouter";

import { buildMonthThemesInput, extractMonthThemes, hasDiaryText, monthThemesJsonSchema, parseMonthThemes, sanitizeMonthThemes } from "./month-themes-ai";

vi.mock("server-only", () => ({}));

const diary = { month: "2026-10", positives: [{ date: "2026-10-05", body: "ジムに行けた" }], reflections: [{ date: "2026-10-06", text: "また夜食を食べた" }] };

describe("sanitizeMonthThemes / parseMonthThemes", () => {
  it("ラベルを整える: 前後の空白を除き、空・長すぎる・改行つき・重複は捨て、個数の上限で切る", () => {
    const themes = sanitizeMonthThemes({
      worries: [" 夜食 ", "", "夜食", "あ".repeat(25), "a\nb", "疲れ", "仕事", "寝不足", "5つ目"],
      wins: ["筋トレ"],
      topics: ["家族", "天気", "読書", "4つ目"],
    });
    expect(themes).toEqual({ worries: ["夜食", "疲れ", "仕事", "寝不足"], wins: ["筋トレ"], topics: ["家族", "天気", "読書"] });
  });

  it("形が違えば null / 失敗(3 つの配列が要る)", () => {
    expect(sanitizeMonthThemes({ worries: [] })).toBeNull();
    expect(sanitizeMonthThemes({ worries: "夜食", wins: [], topics: [] })).toBeNull();
    expect(sanitizeMonthThemes(null)).toBeNull();
    expect(parseMonthThemes("これは JSON ではない")).toEqual({ ok: false, reason: "JSON として読めない" });
    expect(parseMonthThemes(JSON.stringify({ wins: [] }))).toEqual({ ok: false, reason: "形が違う" });
  });

  it("3 つとも空でもよい(テーマが見つからない月)", () => {
    expect(parseMonthThemes(JSON.stringify({ worries: [], wins: [], topics: [] }))).toEqual({ ok: true, themes: { worries: [], wins: [], topics: [] } });
  });

  it("JSON スキーマに、Google のモデルが拒否する項目を入れない", () => {
    const text = JSON.stringify(monthThemesJsonSchema);
    for (const key of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "additionalProperties"]) expect(text).not.toContain(key);
  });
});

describe("入力", () => {
  it("日記のある月かを判定する。入力は、月・良かったこと・今日の気づきを、日付つきで持つ", () => {
    expect(hasDiaryText(diary)).toBe(true);
    expect(hasDiaryText({ month: "2026-10", positives: [], reflections: [] })).toBe(false);
    expect(JSON.parse(buildMonthThemesInput(diary))).toEqual({
      月: "2026-10",
      良かったこと: [{ 日付: "2026-10-05", 内容: "ジムに行けた" }],
      今日の気づき: [{ 日付: "2026-10-06", 内容: "また夜食を食べた" }],
    });
  });
});

describe("extractMonthThemes", () => {
  it("返事を検証して、整えたテーマを返す。日記は、ユーザーのメッセージにだけ入る", async () => {
    const complete = vi.fn<typeof completeJson>(async () => JSON.stringify({ worries: ["夜食"], wins: ["筋トレ"], topics: [] }));
    const result = await extractMonthThemes(diary, complete);
    expect(result).toEqual({ ok: true, themes: { worries: ["夜食"], wins: ["筋トレ"], topics: [] } });
    const call = complete.mock.calls[0]?.[0];
    if (!call) throw new Error("complete が呼ばれていない");
    expect(call.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(String(call.messages[0].content)).not.toContain("夜食を食べた"); // システムの指示には、日記が入らない
    expect(String(call.messages[1].content)).toContain("また夜食を食べた");
  });

  it("接続や返事の失敗は ok: false(投げない)。形が違う返事も ok: false", async () => {
    const failing = vi.fn<typeof completeJson>(async () => {
      throw new OpenRouterError("network", "接続できない");
    });
    expect(await extractMonthThemes(diary, failing)).toEqual({ ok: false, reason: "network" });
    expect(await extractMonthThemes(diary, vi.fn<typeof completeJson>(async () => "[]"))).toEqual({ ok: false, reason: "形が違う" });
  });

  it("想定外の失敗(プログラムの誤り)は、隠さず投げる", async () => {
    const broken = vi.fn<typeof completeJson>(async () => {
      throw new TypeError("バグ");
    });
    await expect(extractMonthThemes(diary, broken)).rejects.toThrow("バグ");
  });
});
