ALTER TABLE "days" ADD COLUMN "sleep_bedtime" varchar(5);--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "sleep_wake_time" varchar(5);--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_sleep_bedtime_format" CHECK ("days"."sleep_bedtime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "days" ADD CONSTRAINT "days_sleep_wake_time_format" CHECK ("days"."sleep_wake_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');