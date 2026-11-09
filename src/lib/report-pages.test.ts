import { describe, expect, it } from "vitest";
import { REPORTS_PER_PAGE, pageOfReports, reportsLastPage } from "./report-pages";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("reportsLastPage", () => {
  it("12 件で 1 ページ。13 件から 2 ページ。0 件でも 1 ページ", () => {
    expect(REPORTS_PER_PAGE).toBe(12);
    expect(reportsLastPage(0)).toBe(1);
    expect(reportsLastPage(12)).toBe(1);
    expect(reportsLastPage(13)).toBe(2);
    expect(reportsLastPage(24)).toBe(2);
    expect(reportsLastPage(25)).toBe(3);
  });
});

describe("pageOfReports", () => {
  it("1 ページ目は先頭の 12 件、2 ページ目は残り(並びは、渡された順のまま)", () => {
    expect(pageOfReports(items(13), 1)).toEqual({ items: items(12), page: 1, lastPage: 2 });
    expect(pageOfReports(items(13), 2)).toEqual({ items: [13], page: 2, lastPage: 2 });
  });

  it("最後のページより先を指していたら、最後のページに寄せる", () => {
    expect(pageOfReports(items(13), 99)).toEqual({ items: [13], page: 2, lastPage: 2 });
  });

  it("件数が 0 でも、空の 1 ページ目を返す", () => {
    expect(pageOfReports([], 1)).toEqual({ items: [], page: 1, lastPage: 1 });
    expect(pageOfReports([], 5)).toEqual({ items: [], page: 1, lastPage: 1 });
  });

  it("ちょうど 12 件なら、1 ページだけ", () => {
    expect(pageOfReports(items(12), 2)).toEqual({ items: items(12), page: 1, lastPage: 1 });
  });
});
