ALTER TABLE "meals" DROP CONSTRAINT "meals_day_id_days_id_fk";
--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_day_fk" FOREIGN KEY ("user_id","day_id") REFERENCES "public"."days"("user_id","id") ON DELETE cascade ON UPDATE no action;