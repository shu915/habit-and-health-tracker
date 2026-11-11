import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config: 検索エンジンに載せない", () => {
  it("全部のパスに、X-Robots-Tag: noindex, nofollow を付ける", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/:path*");
    expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });
});

describe("next.config: 応答ヘッダー(全部のパス)", () => {
  it("枠への埋め込みを断り、Content-Type の推測を止め、別のサイトへ URL を送らない", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/:path*");
    expect(rule?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(rule?.headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
    expect(rule?.headers).toContainEqual({ key: "Referrer-Policy", value: "same-origin" });
  });
});
