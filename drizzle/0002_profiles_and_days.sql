CREATE TABLE "days" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"morning_weight_kg" numeric(5, 2),
	"morning_body_fat_percent" numeric(4, 1),
	"reflection" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "days_morning_weight_kg_range" CHECK ("days"."morning_weight_kg" IS NULL OR ("days"."morning_weight_kg" > 0 AND "days"."morning_weight_kg" < 500)),
	CONSTRAINT "days_morning_body_fat_percent_range" CHECK ("days"."morning_body_fat_percent" IS NULL OR ("days"."morning_body_fat_percent" > 0 AND "days"."morning_body_fat_percent" < 100))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gender" varchar(20),
	"age" integer,
	"height_cm" numeric(5, 1),
	"current_weight_kg" numeric(5, 2),
	"current_body_fat_percent" numeric(4, 1),
	"current_waist_cm" numeric(5, 1),
	"activity_level" numeric(4, 3),
	"target_weight_kg" numeric(5, 2),
	"target_calories" integer,
	"target_protein_g" numeric(5, 1),
	"target_sleep_minutes" integer DEFAULT 450 NOT NULL,
	"target_sleep_midpoint" varchar(5) DEFAULT '03:15' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_age_range" CHECK ("profiles"."age" BETWEEN 0 AND 150),
	CONSTRAINT "profiles_height_cm_range" CHECK ("profiles"."height_cm" > 0 AND "profiles"."height_cm" <= 300),
	CONSTRAINT "profiles_current_weight_kg_range" CHECK ("profiles"."current_weight_kg" > 0 AND "profiles"."current_weight_kg" < 500),
	CONSTRAINT "profiles_current_body_fat_percent_range" CHECK ("profiles"."current_body_fat_percent" > 0 AND "profiles"."current_body_fat_percent" < 100),
	CONSTRAINT "profiles_current_waist_cm_range" CHECK ("profiles"."current_waist_cm" > 0 AND "profiles"."current_waist_cm" <= 300),
	CONSTRAINT "profiles_activity_level_range" CHECK ("profiles"."activity_level" BETWEEN 1 AND 3),
	CONSTRAINT "profiles_target_weight_kg_range" CHECK ("profiles"."target_weight_kg" > 0 AND "profiles"."target_weight_kg" < 500),
	CONSTRAINT "profiles_target_calories_range" CHECK ("profiles"."target_calories" > 0 AND "profiles"."target_calories" <= 10000),
	CONSTRAINT "profiles_target_protein_g_range" CHECK ("profiles"."target_protein_g" >= 0 AND "profiles"."target_protein_g" <= 1000),
	CONSTRAINT "profiles_target_sleep_minutes_range" CHECK ("profiles"."target_sleep_minutes" > 0 AND "profiles"."target_sleep_minutes" <= 1440),
	CONSTRAINT "profiles_target_sleep_midpoint_format" CHECK ("profiles"."target_sleep_midpoint" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "days_user_date_unique_idx" ON "days" USING btree ("user_id","date");