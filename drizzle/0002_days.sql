CREATE TABLE "days" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"morning_weight_kg" numeric(5, 2),
	"morning_body_fat_percent" numeric(4, 1),
	"sleep_bedtime" varchar(5),
	"sleep_wake_time" varchar(5),
	"profile_target_calories" integer,
	"profile_activity_level" numeric(4, 3),
	"reflection" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "days_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "days_morning_weight_kg_range" CHECK ("days"."morning_weight_kg" IS NULL OR ("days"."morning_weight_kg" > 0 AND "days"."morning_weight_kg" < 500)),
	CONSTRAINT "days_morning_body_fat_percent_range" CHECK ("days"."morning_body_fat_percent" IS NULL OR ("days"."morning_body_fat_percent" > 0 AND "days"."morning_body_fat_percent" < 100)),
	CONSTRAINT "days_sleep_bedtime_format" CHECK ("days"."sleep_bedtime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "days_sleep_wake_time_format" CHECK ("days"."sleep_wake_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "days_user_date_unique_idx" ON "days" USING btree ("user_id","date");