"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronIcon, PersonIcon } from "@/components/menu-icons";
import { SignOutButton } from "@/components/sign-out-button";

// ヘッダーのアカウントのメニュー(押して開く)。マウスを乗せる形にしないのは、タッチの端末でも、同じ動きにするため。
// 閉じるのは、もう一度押す・メニューの外を押す・Esc(Esc のときは、ボタンへフォーカスを戻す)。項目へ移ったら、閉じる。
// キーボード: ボタンで ↓ を押すと、開いて、先頭の項目へ(↑ なら末尾へ)。開いたあとは、↑ ↓ で項目を移り、Home・End で先頭・末尾へ。Tab でメニューの外へ出たら、閉じる。
// 広い画面(sm 以上)はボタンにメールアドレス(長ければ省略)、スマホ幅は「アカウント」の文字。メニューの中には、スマホ幅でも、ログイン中のアドレスが出る
export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef<"first" | "last" | null>(null); // キーボードで開いたとき、どの項目へフォーカスを移すか
  const menuId = useId();

  const items = (): HTMLElement[] => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // 開いているあいだだけ、外を押す・Esc を見る
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // ↓ で開いたときは、先頭の項目へフォーカスを移す
  useEffect(() => {
    if (open && focusOnOpen.current) {
      const list = items();
      (focusOnOpen.current === "first" ? list[0] : list[list.length - 1])?.focus();
      focusOnOpen.current = null;
    }
  }, [open]);

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const which = event.key === "ArrowDown" ? "first" : "last";
    if (!open) {
      focusOnOpen.current = which;
      setOpen(true);
      return;
    }
    const list = items();
    (which === "first" ? list[0] : list[list.length - 1])?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const list = items();
    if (list.length === 0) return;
    const index = list.findIndex((element) => element === document.activeElement);
    const target =
      event.key === "ArrowDown" ? list[(index + 1) % list.length] : event.key === "ArrowUp" ? list[(index - 1 + list.length) % list.length] : event.key === "Home" ? list[0] : event.key === "End" ? list[list.length - 1] : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  return (
    // フォーカスが、このメニューの外の要素へ移ったら(Tab で出たとき)閉じる。移り先が無いとき(メニューの文字を押したときなど)は、閉じない(外を押したときは、別に閉じる)
    <div
      ref={rootRef}
      className="relative print:hidden"
      onBlur={(event) => {
        if (open && event.relatedTarget instanceof Node && !rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={email}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
        className="flex items-center gap-2 rounded-lg bg-neutral px-3 py-2 text-sm whitespace-nowrap text-ink-muted hover:bg-neutral-hover"
      >
        <span className="hidden max-w-60 truncate sm:inline">{email}</span>
        <span className="sm:hidden">アカウント</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[min(20rem,calc(100vw_-_2rem))] overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lg">
          <div className="border-b border-line-soft px-5 py-3.5">
            <p className="text-xs text-ink-muted">ログイン中</p>
            <p className="text-[15px] font-medium break-all text-ink">{email}</p>
          </div>
          <div id={menuId} role="menu" aria-label="アカウントのメニュー" onKeyDown={onMenuKeyDown} className="flex flex-col divide-y divide-line-soft">
            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-5 py-3.5 text-[15px] text-ink hover:bg-neutral focus-visible:bg-neutral focus-visible:outline-none">
              <PersonIcon />
              アカウントの設定
            </Link>
            <SignOutButton variant="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
