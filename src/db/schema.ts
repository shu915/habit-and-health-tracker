import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// 認証は未導入。常に user_id = 1 として扱う(getCurrentUserId() に集約する)
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
