import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// next dev はファイルを変更するたびにこのモジュールを読み直す。そのたびに Pool を作ると接続が増え続けるので、
// 開発中は globalThis に1つだけ持つ
const globalForDb = globalThis as typeof globalThis & { __pgPool?: Pool };
// connectionTimeoutMillis: 接続が取れないときに、待ち続けない(画面が「Rendering」で止まらないように)
const pool = globalForDb.__pgPool ?? new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000 });
// 待機中の接続が、サーバー側(Neon など)から切られると、Pool は error イベントを出す。リスナーが無いと、未処理の例外でプロセスが落ち、
// 同じインスタンスで動いている裏の処理(レポートの作成)も、「作成中」のまま止まる。落とさず、記録だけする(次の要求で、新しい接続を作る)。
// err そのものは出さない(接続文字列が入りうるため)
if (pool.listenerCount("error") === 0) {
  pool.on("error", (err) => console.error("[db] idle client error:", err.name));
}
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });
