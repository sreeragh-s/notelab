ALTER TABLE "team" ADD COLUMN "member_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "teamMember" ADD COLUMN "membership_key" text;
--> statement-breakpoint
ALTER TABLE "teamMember" ADD CONSTRAINT "teamMember_membership_key_unique" UNIQUE("membership_key");
--> statement-breakpoint
UPDATE "team"
SET "member_count" = (
  SELECT count(*)::integer FROM "teamMember"
  WHERE "teamMember"."team_id" = "team"."id"
);
