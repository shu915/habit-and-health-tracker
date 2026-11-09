import { networkInterfaces } from "node:os";

// 開発サーバーを動かしているマシン自身の、LAN のアドレス(IPv4)の一覧。スマホから「http://<このアドレス>:3000」で開くときに許可する。
// 「192.168.*.*」のようなワイルドカードは、ドットも含めて何にでも一致し、192.168.1.1.evil.com のような外のホスト名まで通ってしまうので使わない。
// このマシンの実際のアドレスだけを許可する(アドレスをコードに書かなくてよい)。開発サーバー専用
export function devLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}
