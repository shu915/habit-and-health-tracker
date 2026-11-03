// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isBefore } from "./dom-order";
import { FormActions } from "./form-actions";

afterEach(cleanup);

describe("FormActions", () => {
  it("キャンセル、決定を、真ん中のグループに並べる(中央寄せ)", () => {
    render(
      <FormActions>
        <a href="/x">キャンセル</a>
        <button type="submit">保存</button>
      </FormActions>,
    );
    const cancel = screen.getByRole("link", { name: "キャンセル" });
    const save = screen.getByRole("button", { name: "保存" });
    expect(cancel.parentElement).toBe(save.parentElement); // 同じグループ
    expect(cancel.parentElement?.className).toContain("justify-center");
    expect(isBefore(cancel, save)).toBe(true);
  });

  it("削除は、キャンセル・決定とは別の、左のセルに置く(隣に並べない)", () => {
    render(
      <FormActions remove={<button type="button">削除</button>}>
        <a href="/x">キャンセル</a>
        <button type="submit">保存</button>
      </FormActions>,
    );
    const remove = screen.getByRole("button", { name: "削除" });
    const cancel = screen.getByRole("link", { name: "キャンセル" });
    expect(remove.parentElement?.contains(cancel)).toBe(false);
    expect(remove.parentElement?.className).toContain("justify-self-start");
    expect(isBefore(remove, cancel)).toBe(true);
  });

  it("削除が無くても、行は3つのセルのまま(キャンセル、決定は真ん中のまま)", () => {
    const { container } = render(
      <FormActions>
        <a href="/x">キャンセル</a>
      </FormActions>,
    );
    expect(container.firstElementChild?.children).toHaveLength(3);
    expect(container.firstElementChild?.className).toContain("grid-cols-[1fr_auto_1fr]");
  });
});
