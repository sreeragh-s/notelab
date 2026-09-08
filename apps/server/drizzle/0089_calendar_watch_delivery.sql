ALTER TABLE "calendar_watch_channel" ADD COLUMN "message_number" text DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "calendar_watch_channel" ADD COLUMN "dirty_at" timestamp with time zone;
