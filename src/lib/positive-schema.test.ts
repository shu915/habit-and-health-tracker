import { describe, expect, it } from "vitest";
import { POSITIVE_BODY_MAX_LENGTH, POSITIVE_MAX_PER_DAY } from "./positive-limits";
import { parsePositiveForm, POSITIVE_FIELDS } from "./positive-schema";

const empty = { body1: "", body2: "", body3: "" };

describe("parsePositiveForm", () => {
  it("すべて空欄なら、何も書かなかったものとして、空の一覧を返す", () => {
    expect(parsePositiveForm(empty)).toEqual({ ok: true, values: [] });
  });

  it("書かれた欄を、書いた順に返す", () => {
    expect(parsePositiveForm({ ...empty, body1: "天気が良かった。気分が晴れた", body2: "味噌汁がおいしかった" })).toEqual({
      ok: true,
      values: ["天気が良かった。気分が晴れた", "味噌汁がおいしかった"],
    });
  });

  it("空欄はつめる(3 つ目だけ書いても、1 件目として返す)", () => {
    expect(parsePositiveForm({ ...empty, body3: "散歩した" })).toEqual({ ok: true, values: ["散歩した"] });
    expect(parsePositiveForm({ ...empty, body1: "a", body3: "c" })).toEqual({ ok: true, values: ["a", "c"] });
  });

  it("前後の空白を取り、空白だけの欄は空欄として扱う", () => {
    expect(parsePositiveForm({ ...empty, body1: "  良かった ", body2: "   " })).toEqual({ ok: true, values: ["良かった"] });
  });

  it("文字数は、ちょうど上限なら通り、1 文字超えると、その欄のエラーにする", () => {
    expect(parsePositiveForm({ ...empty, body1: "あ".repeat(POSITIVE_BODY_MAX_LENGTH) }).ok).toBe(true);

    const tooLong = parsePositiveForm({ ...empty, body2: "あ".repeat(POSITIVE_BODY_MAX_LENGTH + 1) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(Object.keys(tooLong.errors)).toEqual(["body2"]);
  });

  it("NUL 文字を含むものは拒否する(PostgreSQL の text に入らない)", () => {
    expect(parsePositiveForm({ ...empty, body1: "a\u0000b" }).ok).toBe(false);
  });

  it("キーが無い欄は、空欄として扱う", () => {
    expect(parsePositiveForm({ body2: "だけ" })).toEqual({ ok: true, values: ["だけ"] });
    expect(parsePositiveForm({})).toEqual({ ok: true, values: [] });
  });

  it("複数の欄のエラーが同時に出る", () => {
    const result = parsePositiveForm({ body1: "あ".repeat(POSITIVE_BODY_MAX_LENGTH + 1), body3: "い".repeat(POSITIVE_BODY_MAX_LENGTH + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["body1", "body3"]);
  });

  it("定義された欄以外のキーは無視する(user_id などを紛れ込ませても結果に入らない)", () => {
    expect(parsePositiveForm({ ...empty, body1: "a", userId: "x", user_id: "x", dayId: "1", position: "3" })).toEqual({ ok: true, values: ["a"] });
  });

  it("欄は 3 つ", () => {
    expect(POSITIVE_MAX_PER_DAY).toBe(3);
    expect([...POSITIVE_FIELDS].sort()).toEqual(["body1", "body2", "body3"]);
  });
});
