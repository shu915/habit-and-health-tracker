import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// かな・漢字の書体(Zen Kaku Gothic New、SIL OFL。src/app/fonts/OFL.txt)。自分で持つ: next/font/google は日本語の断片が多すぎて開発サーバーで失敗したため。
// 使う字(ASCII・かな・JIS の漢字・記号)だけに削った woff2 を、400 と 700 の 2 つ置く(500 は無く、ブラウザが 400 で描く。各 1MB 前後で、重いので)。先読みはせず、初回だけ読み込んで、あとはキャッシュされる
const zenKaku = localFont({
  variable: "--font-zen-kaku",
  display: "swap",
  preload: false,
  src: [
    { path: "./fonts/ZenKakuGothicNew-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ZenKakuGothicNew-Bold.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Habit and Health Tracker",
  description: "食事・体重・睡眠・日記を記録して、集計とAIフィードバックを得る生活習慣管理アプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${zenKaku.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
