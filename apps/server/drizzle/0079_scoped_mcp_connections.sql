ALTER TABLE "ai_mcp_connection"
  ADD COLUMN "scope_type" text NOT NULL DEFAULT 'agent',
  ADD COLUMN "scope_user_id" text REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" ALTER COLUMN "agent_profile_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" DROP CONSTRAINT "ai_mcp_connection_profile_endpoint_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_mcp_connection_profile_endpoint_unique"
  ON "ai_mcp_connection" ("agent_profile_id", "endpoint_url")
  WHERE "scope_type" = 'agent';
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_mcp_connection_personal_endpoint_unique"
  ON "ai_mcp_connection" ("workspace_id", "scope_user_id", "endpoint_url")
  WHERE "scope_type" = 'personal';
--> statement-breakpoint
ALTER TABLE "ai_mcp_connection" ADD CONSTRAINT "ai_mcp_connection_scope_check" CHECK (
  ("scope_type" = 'agent' AND "agent_profile_id" IS NOT NULL AND "scope_user_id" IS NULL)
  OR
  ("scope_type" = 'personal' AND "agent_profile_id" IS NULL AND "scope_user_id" IS NOT NULL AND "authenticated_by_user_id" = "scope_user_id")
);
--> statement-breakpoint

ALTER TABLE "ai_mcp_activity"
  ADD COLUMN "scope_type" text NOT NULL DEFAULT 'agent',
  ADD COLUMN "scope_user_id" text REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" ALTER COLUMN "agent_profile_id" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_mcp_activity_personal_created_idx"
  ON "ai_mcp_activity" ("workspace_id", "scope_user_id", "created_at");
--> statement-breakpoint
ALTER TABLE "ai_mcp_activity" ADD CONSTRAINT "ai_mcp_activity_scope_check" CHECK (
  ("scope_type" = 'agent' AND "agent_profile_id" IS NOT NULL AND "scope_user_id" IS NULL)
  OR
  ("scope_type" = 'personal' AND "agent_profile_id" IS NULL AND "scope_user_id" IS NOT NULL)
);
--> statement-breakpoint

ALTER TABLE "ai_agent_pending_action"
  ADD COLUMN "mcp_scope_type" text,
  ADD COLUMN "mcp_scope_user_id" text REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
UPDATE "ai_agent_pending_action"
  SET "mcp_scope_type" = 'agent'
  WHERE "connection_id" IS NOT NULL AND "agent_profile_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_mcp_scope_check" CHECK (
  "connection_id" IS NULL
  OR ("mcp_scope_type" = 'agent' AND "agent_profile_id" IS NOT NULL AND "mcp_scope_user_id" IS NULL)
  OR ("mcp_scope_type" = 'personal' AND "agent_profile_id" IS NULL AND "mcp_scope_user_id" IS NOT NULL)
);
--> statement-breakpoint

ALTER TABLE "ai_mcp_dataset"
  ADD COLUMN "scope_type" text NOT NULL DEFAULT 'agent',
  ADD COLUMN "scope_user_id" text REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ALTER COLUMN "agent_profile_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ADD CONSTRAINT "ai_mcp_dataset_scope_check" CHECK (
  ("scope_type" = 'agent' AND "agent_profile_id" IS NOT NULL AND "scope_user_id" IS NULL)
  OR
  ("scope_type" = 'personal' AND "agent_profile_id" IS NULL AND "scope_user_id" IS NOT NULL)
);
--> statement-breakpoint

ALTER TABLE "ai_mcp_materialization"
  ADD COLUMN "scope_type" text NOT NULL DEFAULT 'agent',
  ADD COLUMN "scope_user_id" text REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ALTER COLUMN "agent_profile_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ADD CONSTRAINT "ai_mcp_materialization_scope_check" CHECK (
  ("scope_type" = 'agent' AND "agent_profile_id" IS NOT NULL AND "scope_user_id" IS NULL)
  OR
  ("scope_type" = 'personal' AND "agent_profile_id" IS NULL AND "scope_user_id" IS NOT NULL)
);
