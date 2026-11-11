CREATE TABLE "ai_consents" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"consented_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(8) DEFAULT 'done' NOT NULL,
	"error_message" text,
	"content" jsonb,
	"badges" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"consent_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_user_kind_period_unique" UNIQUE("user_id","kind","period_start"),
	CONSTRAINT "reports_kind_check" CHECK ("reports"."kind" IN ('four-weeks', 'monthly', 'quarterly', 'yearly')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" IN ('creating', 'done', 'failed')),
	CONSTRAINT "reports_done_has_content" CHECK ("reports"."status" <> 'done' OR "reports"."content" IS NOT NULL),
	CONSTRAINT "reports_period_order" CHECK ("reports"."period_start" <= "reports"."period_end")
);
--> statement-breakpoint
ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_user_created_idx" ON "reports" USING btree ("user_id","created_at");