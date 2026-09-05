ALTER TABLE "ai_agent_profile"
  ADD COLUMN "current_revision_id" text,
  ADD COLUMN "execution_disabled_reason" text;
--> statement-breakpoint

CREATE TABLE "ai_agent_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "compiled_definition" jsonb NOT NULL,
  "definition_hash" text NOT NULL,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "source_message_id" text,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_revision_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_revision_profile_version_unique"
  ON "ai_agent_revision" ("profile_id", "version");
--> statement-breakpoint
CREATE INDEX "ai_agent_revision_profile_created_idx"
  ON "ai_agent_revision" ("profile_id", "created_at");
--> statement-breakpoint

INSERT INTO "ai_agent_revision" (
  "id", "profile_id", "version", "definition", "compiled_definition",
  "definition_hash", "created_by_user_id", "created_at"
)
SELECT
  gen_random_uuid()::text,
  profile."id",
  GREATEST(profile."version", 1),
  jsonb_build_object(
    'name', profile."name",
    'description', profile."description",
    'icon', profile."icon",
    'instructions', profile."instructions",
    'defaultModel', profile."default_model",
    'triggers', '[]'::jsonb
  ),
  jsonb_build_object(
    'name', profile."name",
    'description', profile."description",
    'icon', profile."icon",
    'instructions', profile."instructions",
    'defaultModel', profile."default_model",
    'triggers', '[]'::jsonb
  ),
  md5(concat_ws(E'\x1f', profile."name", profile."description", profile."instructions", profile."default_model", profile."version"::text)),
  profile."owner_user_id",
  profile."updated_at"
FROM "ai_agent_profile" profile;
--> statement-breakpoint

UPDATE "ai_agent_profile" profile
SET "current_revision_id" = revision."id"
FROM "ai_agent_revision" revision
WHERE revision."profile_id" = profile."id"
  AND revision."version" = profile."version";
--> statement-breakpoint
ALTER TABLE "ai_agent_profile"
  ADD CONSTRAINT "ai_agent_profile_current_revision_fk"
  FOREIGN KEY ("current_revision_id") REFERENCES "ai_agent_revision"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE "ai_agent_conversation" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "visibility" text NOT NULL DEFAULT 'shared',
  "legacy_owner_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "legacy_thread_id" text REFERENCES "ai_chat_thread"("id") ON DELETE CASCADE,
  "next_message_sequence" integer NOT NULL DEFAULT 0,
  "last_activity_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_conversation_visibility_check" CHECK ("visibility" IN ('shared', 'legacy_private'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_conversation_shared_unique"
  ON "ai_agent_conversation" ("profile_id") WHERE "visibility" = 'shared';
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_conversation_legacy_thread_unique"
  ON "ai_agent_conversation" ("legacy_thread_id") WHERE "legacy_thread_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_agent_conversation_profile_activity_idx"
  ON "ai_agent_conversation" ("profile_id", "last_activity_at");
--> statement-breakpoint

INSERT INTO "ai_agent_conversation" (
  "id", "profile_id", "visibility", "next_message_sequence",
  "last_activity_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  profile."id",
  'shared',
  0,
  profile."updated_at",
  profile."created_at",
  profile."updated_at"
FROM "ai_agent_profile" profile;
--> statement-breakpoint

INSERT INTO "ai_agent_conversation" (
  "id", "profile_id", "visibility", "legacy_owner_user_id", "legacy_thread_id",
  "next_message_sequence", "last_activity_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  thread."agent_profile_id",
  'legacy_private',
  thread."user_id",
  thread."id",
  thread."next_message_sequence",
  thread."last_activity_at",
  thread."created_at",
  thread."updated_at"
FROM "ai_chat_thread" thread
WHERE thread."agent_profile_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "ai_agent_conversation_message" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "ai_agent_conversation"("id") ON DELETE CASCADE,
  "author_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "client_id" text,
  "role" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'message',
  "parts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sequence" integer NOT NULL,
  "run_id" text,
  "revision_id" text REFERENCES "ai_agent_revision"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'completed',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_conversation_message_role_check" CHECK ("role" IN ('user', 'assistant', 'system')),
  CONSTRAINT "ai_agent_conversation_message_kind_check" CHECK ("kind" IN ('message', 'revision', 'run', 'approval')),
  CONSTRAINT "ai_agent_conversation_message_status_check" CHECK ("status" IN ('pending', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_conversation_message_sequence_unique"
  ON "ai_agent_conversation_message" ("conversation_id", "sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_conversation_message_client_unique"
  ON "ai_agent_conversation_message" ("conversation_id", "client_id") WHERE "client_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_agent_conversation_message_created_idx"
  ON "ai_agent_conversation_message" ("conversation_id", "created_at");
--> statement-breakpoint

INSERT INTO "ai_agent_conversation_message" (
  "id", "conversation_id", "author_user_id", "client_id", "role", "kind",
  "parts", "sequence", "status", "created_at", "updated_at"
)
SELECT
  message."id",
  conversation."id",
  CASE WHEN message."role" = 'user' THEN thread."user_id" ELSE NULL END,
  message."client_id",
  CASE WHEN message."role" IN ('user', 'assistant', 'system') THEN message."role" ELSE 'assistant' END,
  'message',
  message."parts",
  message."sequence",
  message."status",
  message."created_at",
  message."updated_at"
FROM "ai_chat_message" message
JOIN "ai_chat_thread" thread ON thread."id" = message."thread_id"
JOIN "ai_agent_conversation" conversation ON conversation."legacy_thread_id" = thread."id"
WHERE thread."agent_profile_id" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE "ai_agent_trigger" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "revision_id" text NOT NULL REFERENCES "ai_agent_revision"("id") ON DELETE RESTRICT,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "next_run_at" timestamptz,
  "last_run_at" timestamptz,
  "webhook_secret_id" text REFERENCES "automation_secret"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_trigger_kind_check" CHECK ("kind" IN ('manual', 'schedule', 'database', 'comment', 'mention', 'meeting', 'webhook', 'slack', 'connector')),
  CONSTRAINT "ai_agent_trigger_status_check" CHECK ("status" IN ('active', 'paused', 'degraded', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX "ai_agent_trigger_due_idx" ON "ai_agent_trigger" ("status", "next_run_at");
--> statement-breakpoint
CREATE INDEX "ai_agent_trigger_profile_status_idx" ON "ai_agent_trigger" ("profile_id", "status");
--> statement-breakpoint

CREATE TABLE "ai_agent_run" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "revision_id" text NOT NULL REFERENCES "ai_agent_revision"("id") ON DELETE RESTRICT,
  "trigger_id" text REFERENCES "ai_agent_trigger"("id") ON DELETE SET NULL,
  "initiated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "trigger_kind" text NOT NULL,
  "occurrence_key" text,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "permission_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb,
  "output_summary" text,
  "status" text NOT NULL DEFAULT 'queued',
  "available_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "error_code" varchar(80),
  "error_summary" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "duration_ms" integer,
  "chain_depth" integer NOT NULL DEFAULT 0,
  "origin_run_id" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_run_status_check" CHECK ("status" IN ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'skipped')),
  CONSTRAINT "ai_agent_run_trigger_kind_check" CHECK ("trigger_kind" IN ('manual', 'schedule', 'database', 'comment', 'mention', 'meeting', 'webhook', 'slack', 'connector')),
  CONSTRAINT "ai_agent_run_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "chain_depth" BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_run_occurrence_unique"
  ON "ai_agent_run" ("profile_id", "occurrence_key") WHERE "occurrence_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_agent_run_claim_idx"
  ON "ai_agent_run" ("status", "available_at", "lease_expires_at") WHERE "status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX "ai_agent_run_profile_created_idx" ON "ai_agent_run" ("profile_id", "created_at");
--> statement-breakpoint

ALTER TABLE "ai_agent_conversation_message"
  ADD CONSTRAINT "ai_agent_conversation_message_run_fk"
  FOREIGN KEY ("run_id") REFERENCES "ai_agent_run"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE TABLE "ai_agent_run_event" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "ai_agent_run"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'shared',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_run_event_visibility_check" CHECK ("visibility" IN ('shared', 'editor'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_run_event_sequence_unique" ON "ai_agent_run_event" ("run_id", "sequence");
--> statement-breakpoint
CREATE INDEX "ai_agent_run_event_created_idx" ON "ai_agent_run_event" ("run_id", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_agent_event_receipt" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "trigger_id" text REFERENCES "ai_agent_trigger"("id") ON DELETE CASCADE,
  "event_key" text NOT NULL,
  "run_id" text REFERENCES "ai_agent_run"("id") ON DELETE SET NULL,
  "received_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_event_receipt_profile_event_unique" ON "ai_agent_event_receipt" ("profile_id", "event_key");
--> statement-breakpoint
CREATE INDEX "ai_agent_event_receipt_received_idx" ON "ai_agent_event_receipt" ("workspace_id", "received_at");
--> statement-breakpoint

ALTER TABLE "ai_agent_tool_execution"
  ALTER COLUMN "turn_id" DROP NOT NULL,
  ADD COLUMN "agent_run_id" text REFERENCES "ai_agent_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP INDEX "ai_agent_tool_execution_turn_call_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_tool_execution_turn_call_unique"
  ON "ai_agent_tool_execution" ("turn_id", "tool_call_id") WHERE "turn_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_tool_execution_run_call_unique"
  ON "ai_agent_tool_execution" ("agent_run_id", "tool_call_id") WHERE "agent_run_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_agent_tool_execution_run_created_idx" ON "ai_agent_tool_execution" ("agent_run_id", "created_at");
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution" ADD CONSTRAINT "ai_agent_tool_execution_context_check"
  CHECK ((("turn_id" IS NOT NULL)::int + ("agent_run_id" IS NOT NULL)::int) = 1);
--> statement-breakpoint

ALTER TABLE "ai_agent_pending_action"
  ALTER COLUMN "thread_id" DROP NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "agent_run_id" text REFERENCES "ai_agent_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP INDEX "ai_agent_pending_action_thread_call_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_pending_action_thread_call_unique"
  ON "ai_agent_pending_action" ("thread_id", "tool_call_id") WHERE "thread_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_pending_action_run_call_unique"
  ON "ai_agent_pending_action" ("agent_run_id", "tool_call_id") WHERE "agent_run_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action" ADD CONSTRAINT "ai_agent_pending_action_context_check"
  CHECK ((("thread_id" IS NOT NULL)::int + ("agent_run_id" IS NOT NULL)::int) = 1);
--> statement-breakpoint

ALTER TABLE "ai_mcp_dataset"
  ALTER COLUMN "thread_id" DROP NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "agent_run_id" text REFERENCES "ai_agent_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_dataset" ADD CONSTRAINT "ai_mcp_dataset_context_check"
  CHECK ((("thread_id" IS NOT NULL)::int + ("agent_run_id" IS NOT NULL)::int) = 1);
--> statement-breakpoint

ALTER TABLE "ai_mcp_materialization"
  ALTER COLUMN "thread_id" DROP NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "agent_run_id" text REFERENCES "ai_agent_run"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_mcp_materialization" ADD CONSTRAINT "ai_mcp_materialization_context_check"
  CHECK ((("thread_id" IS NOT NULL)::int + ("agent_run_id" IS NOT NULL)::int) = 1);
