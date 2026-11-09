// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportPager } from "./report-pager";

afterEach(cleanup);

describe("ReportPager", () => {
  it("1 ページだけなら、何も出さない", () => {
    const { container } = render(<ReportPager page={1} lastPage={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("1 ページ目: 「古いレポート」だけ(古いほうへ)。ページ番号も出す", () => {
    render(<ReportPager page={1} lastPage={3} />);
    expect(screen.queryByText(/新しいレポート/)).toBeNull();
    expect(screen.getByRole("link", { name: /古いレポート/ }).getAttribute("href")).toBe("/reports?page=2#periodic-reports");
    expect(screen.getByText("1 / 3 ページ")).toBeTruthy();
  });

  it("途中のページ: 両方出す。2 ページ目から 1 ページ目へは、?page= を付けない", () => {
    render(<ReportPager page={2} lastPage={3} />);
    expect(screen.getByRole("link", { name: /新しいレポート/ }).getAttribute("href")).toBe("/reports#periodic-reports");
    expect(screen.getByRole("link", { name: /古いレポート/ }).getAttribute("href")).toBe("/reports?page=3#periodic-reports");
  });

  it("最後のページ: 「新しいレポート」だけ", () => {
    render(<ReportPager page={3} lastPage={3} />);
    expect(screen.queryByText(/古いレポート/)).toBeNull();
    expect(screen.getByRole("link", { name: /新しいレポート/ }).getAttribute("href")).toBe("/reports?page=2#periodic-reports");
  });
});
