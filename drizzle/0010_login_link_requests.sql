CREATE TABLE "login_link_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_link_requests_hash_created_idx" ON "login_link_requests" USING btree ("email_hash","created_at");