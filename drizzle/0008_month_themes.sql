CREATE TABLE "month_themes" (
	"user_id" text NOT NULL,
	"month_start" date NOT NULL,
	"themes" jsonb NOT NULL,
	"consent_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "month_themes_user_id_month_start_pk" PRIMARY KEY("user_id","month_start"),
	CONSTRAINT "month_themes_month_start_check" CHECK (EXTRACT(DAY FROM "month_themes"."month_start") = 1)
);
--> statement-breakpoint
ALTER TABLE "month_themes" ADD CONSTRAINT "month_themes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;