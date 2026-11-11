import type { NextConfig } from "next";
import { devLanAddresses } from "./src/lib/dev-lan";

const nextConfig: NextConfig = {
  // 開発中に、同じ Wi-Fi のスマホから LAN のアドレスで開くための許可(ないと、画面の部品が読み込まれず、ボタンが動かない)。このマシン自身のアドレスだけ。開発サーバーだけに効く
  allowedDevOrigins: devLanAddresses(),
  experimental: {
    // 食事の写真(最大 4 枚)を、ブラウザ側で縮小して Server Action で送る(1 枚は数百 KB)。既定の 1MB だと足りない。
    // 4 枚 × 1 枚の上限(meal-limits.ts の MAX_PHOTOS × IMAGE_MAX_LENGTH = 3.6MB 相当)が、この 4MB に収まる。
    // この設定は、すべての Server Action に効く(Action ごとには変えられない)。ほかの Action(プロフィールなど)は、
    // 入力の文字数と形を zod で絞っているので、本文が大きくても、検証で失敗するだけ。本番ビルドで、約 3.9MB は通り、約 4.5MB は弾かれることを確かめた
    serverActions: { bodySizeLimit: "4mb" },
  },
  // 検索エンジンに載せない(全部のパス)。robots.txt で「来ないで」と断る(Disallow)方法は使わない:
  // 断ると、ロボットがこのヘッダーを読めず、どこかにリンクが貼られた(公開リポジトリの README など)ときに、中身なしの URL だけが載ることがある。
  // 来てもらって、ヘッダーで「載せないで」と伝えるほうが確実
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // 別のサイトの枠(iframe)に入れさせない(クリックジャッキング)。このアプリは、どこにも埋め込まない
          { key: "X-Frame-Options", value: "DENY" },
          // ブラウザに、Content-Type を推測させない
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 別のサイトへ移るとき、URL(日付やレポートの id を含む)を、送らない
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
