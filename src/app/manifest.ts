import type { MetadataRoute } from "next";

// ホーム画面に追加したときの名前・色・アイコン(Android など)。色は globals.css の --accent に合わせた緑
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Habit and Health Tracker",
    short_name: "Habit Health",
    description: "食事・体重・睡眠・日記を記録して、集計と AI フィードバックを得る生活習慣管理アプリ",
    start_url: "/",
    display: "standalone",
    lang: "ja",
    background_color: "#f6f4f0",
    theme_color: "#346b49",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
