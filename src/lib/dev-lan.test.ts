import { afterEach, describe, expect, it, vi } from "vitest";

// このマシン自身の LAN のアドレスだけを返すこと(ワイルドカードや、外のホスト名を返さないこと)を守る
const mockInterfaces = (value: Record<string, unknown[]>) => {
  vi.resetModules();
  vi.doMock("node:os", () => ({ networkInterfaces: () => value }));
};

afterEach(() => {
  vi.doUnmock("node:os");
  vi.resetModules();
});

describe("devLanAddresses", () => {
  it("外向きの IPv4 だけを返す(ループバック・IPv6 は除く)", async () => {
    mockInterfaces({
      lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
      en0: [
        { family: "IPv6", address: "fe80::1", internal: false },
        { family: "IPv4", address: "192.168.1.11", internal: false },
      ],
      en1: [{ family: "IPv4", address: "10.0.0.5", internal: false }],
    });
    const { devLanAddresses } = await import("./dev-lan");
    expect(devLanAddresses()).toEqual(["192.168.1.11", "10.0.0.5"]);
  });

  it("入口が無いときは空(ワイルドカードの既定値を持たない)", async () => {
    mockInterfaces({});
    const { devLanAddresses } = await import("./dev-lan");
    expect(devLanAddresses()).toEqual([]);
  });

  it("どの値にも「*」を含まない", async () => {
    mockInterfaces({ en0: [{ family: "IPv4", address: "192.168.1.11", internal: false }] });
    const { devLanAddresses } = await import("./dev-lan");
    for (const address of devLanAddresses()) expect(address).not.toContain("*");
  });
});
