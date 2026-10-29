-- 実 DB を使うテスト(src/lib/data-access.test.ts)専用のデータベース。開発用の habit_health とは分ける。
-- コンテナを初めて作る(ボリュームが空の)ときだけ実行される
CREATE DATABASE habit_health_test;
