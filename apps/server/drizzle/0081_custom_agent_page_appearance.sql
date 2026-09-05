ALTER TABLE "ai_agent_profile"
  ADD COLUMN "cover" text,
  ADD COLUMN "icon_position" text NOT NULL DEFAULT 'inline';
--> statement-breakpoint
ALTER TABLE "ai_agent_profile"
  ADD CONSTRAINT "ai_agent_profile_icon_position_check"
  CHECK ("icon_position" IN ('inline', 'top'));

