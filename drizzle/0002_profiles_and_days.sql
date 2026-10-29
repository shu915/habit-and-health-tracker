CREATE TABLE "days" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"morning_weight_kg" numeric(5, 2),
	"reflection" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "days_morning_weight_kg_range" CHECK ("days"."morning_weight_kg" IS NULL OR ("days"."morning_weight_kg" > 0 AND "days"."morning_weight_kg" < 500))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gender" varchar(20),
	"age" integer,
	"height_cm" numeric(5, 1),
	"current_weight_kg" numeric(5, 2),
	"current_waist_cm" numeric(5, 1),
	"activity_level" numeric(4, 3),
	"target_weight_kg" numeric(5, 2),
	"target_calories" integer,
	"target_protein_g" numeric(5, 1),
	"target_sleep_minutes" integer DEFAULT 450 NOT NULL,
	"target_sleep_midpoint" varchar(5) DEFAULT '03:15' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "days_user_date_unique_idx" ON "days" USING btree ("user_id","date");