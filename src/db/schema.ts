// Better Auth のテーブル(user / session / account / verification)。auth-schema.ts は生成物なので手編集しない
export * from "./auth-schema";

// アプリ用のテーブルはここに書く。user_id は user.id への外部キー(型は text、onDelete: cascade)
