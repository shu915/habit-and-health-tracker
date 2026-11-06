// アプリのマーク(双葉)。favicon(app/icon.png)・ヘッダーのロゴ(public/logo.webp)と同じ形。
// ログイン画面では名前の上に 72px で置く。名前は文字で書くので、マーク自体は読み上げない
export function AppMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="12" fill="#346b49" />
      <path d="M32 50 C32.8 44 30.9 38.5 32 33" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M31.8 36 C26 24.5 17 21 11.5 24 C13 34 22.5 39.5 31.8 36 Z" fill="#fff" />
      <path d="M32 32.5 C36.5 17 48 11 55.5 13.5 C55 26.5 44 35 32 32.5 Z" fill="#fff" />
    </svg>
  );
}
