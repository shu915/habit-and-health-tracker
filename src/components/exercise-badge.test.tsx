// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExerciseBadge } from "./exercise-badge";

afterEach(cleanup);

describe("ExerciseBadge", () => {
  it("開始時刻から、午前・午後・夜を出す", () => {
    render(<ExerciseBadge time="07:00" />);
    expect(screen.getByText("午前")).toBeTruthy();
    cleanup();
    render(<ExerciseBadge time="14:00" />);
    expect(screen.getByText("午後")).toBeTruthy();
    cleanup();
    render(<ExerciseBadge time="20:00" />);
    expect(screen.getByText("夜")).toBeTruthy();
  });

  it("食事のバッジと同じ時間帯の色(午前=朝食、午後=昼食、夜=夕食)", () => {
    render(<ExerciseBadge time="07:00" />);
    expect(screen.getByText("午前").className).toContain("bg-badge-morning");
    cleanup();
    render(<ExerciseBadge time="14:00" />);
    expect(screen.getByText("午後").className).toContain("bg-badge-noon");
    cleanup();
    render(<ExerciseBadge time="20:00" />);
    expect(screen.getByText("夜").className).toContain("bg-badge-evening");
  });

  it("開始時刻が無いときは、何も出さない", () => {
    const { container } = render(<ExerciseBadge time={null} />);
    expect(container.textContent).toBe("");
  });
});
