import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config: 検索エンジンに載せない", () => {
  it("全部のパスに、X-Robots-Tag: noindex, nofollow を付ける", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === "/:path*");
    expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });
});
