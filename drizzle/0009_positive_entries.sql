CREATE TABLE "positive_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day_id" integer NOT NULL,
	"position" integer NOT NULL,
	"body" varchar(200) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "positive_entries_day_position_unique" UNIQUE("day_id","position"),
	CONSTRAINT "positive_entries_position_range" CHECK ("positive_entries"."position" >= 1 AND "positive_entries"."position" <= 3)
);
--> statement-breakpoint
ALTER TABLE "positive_entries" ADD CONSTRAINT "positive_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positive_entries" ADD CONSTRAINT "positive_entries_user_day_fk" FOREIGN KEY ("user_id","day_id") REFERENCES "public"."days"("user_id","id") ON DELETE cascade ON UPDATE no action;