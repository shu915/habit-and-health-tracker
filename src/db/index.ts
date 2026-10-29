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
const pool = globalForDb.__pgPool ?? new Pool({ connectionString, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });
