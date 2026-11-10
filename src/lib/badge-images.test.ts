import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BADGE_KEYS, BADGE_TIERS } from "./report-badges";

// バッジの絵は public/badges/{種類}-{段階}.svg(report-view.tsx が、バッジの種類と段階から名前を作って読む)。
// 種類か段階を足したのに、絵を置き忘れると、画面で絵が欠けるので、全部の組み合わせがそろっていることを守る
describe("バッジの絵(public/badges)", () => {
  const files = BADGE_KEYS.flatMap((key) => BADGE_TIERS.map((tier) => ({ key, tier, path: join(process.cwd(), "public", "badges", `${key}-${tier}.svg`) })));

  it("全部の種類 × 段階の SVG がそろっている", () => {
    expect(files.filter((file) => !existsSync(file.path)).map((file) => `${file.key}-${file.tier}`)).toEqual([]);
  });

  it("SVG にスクリプトや外部の参照が入っていない(外から持ってきた絵を、そのまま配信するため)", () => {
    for (const file of files) {
      const svg = readFileSync(file.path, "utf8");
      expect(svg, file.path).toMatch(/^<svg /);
      expect(svg, file.path).not.toMatch(/<script|onload=|onclick=|href=|<image|<foreignObject|@import|url\(http/i);
    }
  });
});
