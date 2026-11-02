CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"intensity" varchar(10) NOT NULL,
	"minutes" integer NOT NULL,
	"memo" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_intensity_values" CHECK ("exercises"."intensity" IN ('light', 'normal', 'hard')),
	CONSTRAINT "exercises_minutes_range" CHECK ("exercises"."minutes" >= 1 AND "exercises"."minutes" <= 1440)
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_day_fk" FOREIGN KEY ("user_id","day_id") REFERENCES "public"."days"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_user_day_idx" ON "exercises" USING btree ("user_id","day_id");