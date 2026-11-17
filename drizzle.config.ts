import { defineConfig } from "drizzle-kit";

// ファイルが無いときのエラーかどうか(それ以外のエラーは握りつぶさない)
const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

// drizzle-kit は .env.local を自動では読まないので、ここで読み込む。
// すでに設定されている環境変数は上書きしない(本番へ向けるときは、環境変数で明示的に渡す)
try {
  process.loadEnvFile(".env.local");
} catch (error) {
  // ファイルが無ければ、環境変数だけを使う。読み込み権限や書式のエラーは、そのまま止める
  if (!isMissingFile(error)) throw error;
}

const url = process.env.DATABASE_URL;
if (!url) {
  // 黙って開発用の DB に向かうと、本番に当てたつもりのマイグレーションが当たらない事故になる
  throw new Error(
    "DATABASE_URL が未設定です。.env.local に書くか、環境変数で渡してください(.env.example を参照)",
  );
}

// どの DB に向かうかを、毎回表示する(パスワードは出さない)。
// new URL() が失敗したときの例外は、元の文字列(パスワード入り)を抱えているので、握りつぶして投げ直す
let target: URL;
try {
  target = new URL(url);
} catch {
  throw new Error("DATABASE_URL の形式が不正です(値は表示しません)");
}
console.log(`[drizzle] 接続先: ${target.hostname}:${target.port || "5432"}${target.pathname}`);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});
