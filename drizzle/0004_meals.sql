CREATE TABLE "meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"eaten_time" varchar(5) NOT NULL,
	"dish_name" varchar(100) NOT NULL,
	"alias" varchar(100),
	"description" text,
	"kcal" integer NOT NULL,
	"protein_g" numeric(5, 1) NOT NULL,
	"fat_g" numeric(5, 1) NOT NULL,
	"net_carb_g" numeric(5, 1) NOT NULL,
	"fiber_g" numeric(4, 1),
	"salt_g" numeric(4, 1),
	"items" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meals_eaten_time_format" CHECK ("meals"."eaten_time" ~ '^([01][0-9]|2[0-6]):[0-5][0-9]$'),
	CONSTRAINT "meals_kcal_range" CHECK ("meals"."kcal" >= 0 AND "meals"."kcal" <= 20000),
	CONSTRAINT "meals_protein_g_range" CHECK ("meals"."protein_g" >= 0 AND "meals"."protein_g" <= 1000),
	CONSTRAINT "meals_fat_g_range" CHECK ("meals"."fat_g" >= 0 AND "meals"."fat_g" <= 1000),
	CONSTRAINT "meals_net_carb_g_range" CHECK ("meals"."net_carb_g" >= 0 AND "meals"."net_carb_g" <= 2000),
	CONSTRAINT "meals_fiber_g_range" CHECK ("meals"."fiber_g" IS NULL OR ("meals"."fiber_g" >= 0 AND "meals"."fiber_g" <= 500)),
	CONSTRAINT "meals_salt_g_range" CHECK ("meals"."salt_g" IS NULL OR ("meals"."salt_g" >= 0 AND "meals"."salt_g" <= 100))
);
--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meals_user_date_idx" ON "meals" USING btree ("user_id","date");