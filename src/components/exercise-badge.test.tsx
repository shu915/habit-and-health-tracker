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

  it("食事のバッジと同じ時間帯の色(午前=朝食の琥珀、午後=昼食の空色、夜=夕食の藍色)", () => {
    render(<ExerciseBadge time="07:00" />);
    expect(screen.getByText("午前").className).toContain("bg-amber-100");
    cleanup();
    render(<ExerciseBadge time="14:00" />);
    expect(screen.getByText("午後").className).toContain("bg-sky-100");
    cleanup();
    render(<ExerciseBadge time="20:00" />);
    expect(screen.getByText("夜").className).toContain("bg-indigo-100");
  });

  it("開始時刻が無いときは、何も出さない", () => {
    const { container } = render(<ExerciseBadge time={null} />);
    expect(container.textContent).toBe("");
  });
});
