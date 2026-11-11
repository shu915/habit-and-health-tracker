// アカウントのメニューで使う、線のアイコン(飾り。意味は、隣の文字で読める)。色は文字の色(currentColor)に従う
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function PersonIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg {...base}>
      <path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </svg>
  );
}

// 開いているときは上向き、閉じているときは下向き
export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg {...base} width={16} height={16} className={open ? "" : "rotate-180"}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}
