import { describe, expect, it, vi } from "vitest";
import { encodeWithinLimit, fitWithin } from "./image-resize";

describe("fitWithin", () => {
  it("長辺が収まる大きさは、そのまま(拡大しない)", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("横長は、横を maxEdge にして、縦横比を保つ", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("縦長は、縦を maxEdge にして、縦横比を保つ", () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("極端に細長くても、1 px 未満にならない", () => {
    expect(fitWithin(10000, 10, 1600)).toEqual({ width: 1600, height: 2 });
    expect(fitWithin(100000, 1, 1600).height).toBe(1);
  });

  it("正方形", () => {
    expect(fitWithin(3000, 3000, 1200)).toEqual({ width: 1200, height: 1200 });
  });
});

describe("encodeWithinLimit", () => {
  it("最初の候補(長辺 1600・画質 0.82)が上限に収まれば、それを使う", () => {
    const encode = vi.fn(() => "a".repeat(100));
    expect(encodeWithinLimit(encode, 1000)).toBe("a".repeat(100));
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith(1600, 0.82);
  });

  it("収まらなければ、画質を下げ、次に長辺を小さくして、収まる最初の結果を返す", () => {
    // 長辺 1600 は、どの画質でも 2000 文字。長辺 1200 の画質 0.7 で 900 文字になる
    const encode = vi.fn((edge: number, quality: number) => "a".repeat(edge === 1600 ? 2000 : quality <= 0.7 ? 900 : 1500));
    const result = encodeWithinLimit(encode, 1000);

    expect(result).toBe("a".repeat(900));
    expect(encode.mock.calls).toEqual([
      [1600, 0.82], [1600, 0.7], [1600, 0.55],
      [1200, 0.82], [1200, 0.7],
    ]);
  });

  it("どの候補も収まらなければ null", () => {
    const encode = vi.fn(() => "a".repeat(5000));
    expect(encodeWithinLimit(encode, 1000)).toBeNull();
    expect(encode).toHaveBeenCalledTimes(9); // 3 つの長辺 × 3 つの画質
  });

  it("上限ちょうどは通る", () => {
    expect(encodeWithinLimit(() => "a".repeat(1000), 1000)).toBe("a".repeat(1000));
  });
});
