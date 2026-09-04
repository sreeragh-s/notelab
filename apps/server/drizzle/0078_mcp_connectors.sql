CREATE TABLE "ai_agent_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" jsonb,
  "instructions" text NOT NULL DEFAULT '',
  "default_model" text NOT NULL DEFAULT 'auto',
  "status" text NOT NULL DEFAULT 'active',
  "version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_profile_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "ai_agent_profile_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "ai_agent_profile_workspace_status_idx" ON "ai_agent_profile" ("workspace_id", "status", "updated_at");
--> statement-breakpoint
CREATE TABLE "ai_agent_profile_access" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "principal_type" text NOT NULL,
  "principal_id" text NOT NULL,
  "role" text NOT NULL,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_agent_profile_access_principal_check" CHECK ("principal_type" IN ('user', 'team')),
  CONSTRAINT "ai_agent_profile_access_role_check" CHECK ("role" IN ('editor', 'user')),
  CONSTRAINT "ai_agent_profile_access_unique" UNIQUE ("profile_id", "principal_type", "principal_id")
);
--> statement-breakpoint
CREATE INDEX "ai_agent_profile_access_principal_idx" ON "ai_agent_profile_access" ("principal_type", "principal_id", "profile_id");
--> statement-breakpoint
CREATE TABLE "ai_workspace_mcp_policy" (
  "workspace_id" text PRIMARY KEY NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "custom_servers_enabled" boolean NOT NULL DEFAULT false,
  "installation_policy" text NOT NULL DEFAULT 'approved_and_catalog',
  "external_writes_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_workspace_mcp_installation_policy_check" CHECK ("installation_policy" IN ('approved_and_catalog', 'approved_only'))
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_approved_server" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "endpoint_url" text NOT NULL,
  "label" text NOT NULL,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_approved_server_workspace_url_unique" UNIQUE ("workspace_id", "endpoint_url")
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "agent_profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "catalog_id" text,
  "approved_server_id" text REFERENCES "ai_mcp_approved_server"("id") ON DELETE RESTRICT,
  "endpoint_url" text NOT NULL,
  "server_label" text NOT NULL,
  "auth_method" text NOT NULL,
  "authenticated_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "state" text NOT NULL DEFAULT 'connecting',
  "always_allow_enabled" boolean NOT NULL DEFAULT false,
  "last_discovered_at" timestamptz,
  "last_error_code" varchar(80),
  "disabled_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_connection_auth_method_check" CHECK ("auth_method" IN ('oauth', 'headers')),
  CONSTRAINT "ai_mcp_connection_state_check" CHECK ("state" IN ('connecting', 'connected', 'degraded', 'reconnect_required', 'disabled')),
  CONSTRAINT "ai_mcp_connection_profile_endpoint_unique" UNIQUE ("agent_profile_id", "endpoint_url")
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_connection_profile_state_idx" ON "ai_mcp_connection" ("agent_profile_id", "state");
--> statement-breakpoint
CREATE TABLE "ai_mcp_credential" (
  "connection_id" text PRIMARY KEY NOT NULL REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  "key_version" text NOT NULL,
  "secret_purpose" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "auth_tag" text NOT NULL,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_oauth_attempt" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  "state_hash" text NOT NULL UNIQUE,
  "key_version" text NOT NULL,
  "code_verifier_ciphertext" text NOT NULL,
  "code_verifier_iv" text NOT NULL,
  "code_verifier_auth_tag" text NOT NULL,
  "issuer" text,
  "redirect_uri" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_oauth_attempt_expiry_idx" ON "ai_mcp_oauth_attempt" ("expires_at", "consumed_at");
--> statement-breakpoint
CREATE TABLE "ai_mcp_client_registration" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "issuer" text NOT NULL,
  "connection_id" text NOT NULL REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "key_version" text,
  "client_secret_ciphertext" text,
  "client_secret_iv" text,
  "client_secret_auth_tag" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_client_registration_connection_issuer_unique" UNIQUE ("connection_id", "issuer")
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_tool_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  "external_name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "input_schema" jsonb NOT NULL,
  "annotations" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "schema_hash" text NOT NULL,
  "classification" text NOT NULL DEFAULT 'unknown',
  "execution_mode" text NOT NULL DEFAULT 'always_ask',
  "enabled" boolean NOT NULL DEFAULT false,
  "available" boolean NOT NULL DEFAULT true,
  "discovered_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_tool_snapshot_classification_check" CHECK ("classification" IN ('read', 'write', 'unknown')),
  CONSTRAINT "ai_mcp_tool_snapshot_execution_mode_check" CHECK ("execution_mode" IN ('automatic', 'always_ask')),
  CONSTRAINT "ai_mcp_tool_snapshot_connection_name_unique" UNIQUE ("connection_id", "external_name")
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_tool_snapshot_enabled_idx" ON "ai_mcp_tool_snapshot" ("connection_id", "enabled", "available");
--> statement-breakpoint
CREATE TABLE "ai_mcp_activity" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "agent_profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "connection_id" text REFERENCES "ai_mcp_connection"("id") ON DELETE SET NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "outcome" text NOT NULL,
  "provider_label" text,
  "tool_name" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_activity_profile_created_idx" ON "ai_mcp_activity" ("agent_profile_id", "created_at");
--> statement-breakpoint
ALTER TABLE "ai_chat_thread" ADD COLUMN "agent_profile_id" text REFERENCES "ai_agent_profile"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "ai_chat_thread_agent_profile_idx" ON "ai_chat_thread" ("agent_profile_id", "user_id", "last_activity_at");
--> statement-breakpoint
ALTER TABLE "ai_agent_turn" ADD COLUMN "agent_profile_id" text REFERENCES "ai_agent_profile"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "ai_agent_tool_execution"
  ADD COLUMN "connection_id" text REFERENCES "ai_mcp_connection"("id") ON DELETE SET NULL,
  ADD COLUMN "external_tool_name" text,
  ADD COLUMN "actual_effect" text,
  ADD COLUMN "schema_hash" text,
  ADD COLUMN "approval_actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  ADD COLUMN "outcome_unknown" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "ai_agent_pending_action"
  ADD COLUMN "agent_profile_id" text REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  ADD COLUMN "connection_id" text REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  ADD COLUMN "external_tool_name" text,
  ADD COLUMN "tool_schema_hash" text,
  ADD COLUMN "encrypted_tool_input" text,
  ADD COLUMN "encrypted_tool_input_iv" text,
  ADD COLUMN "encrypted_tool_input_auth_tag" text;
--> statement-breakpoint
CREATE TABLE "ai_mcp_dataset" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "agent_profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "connection_id" text NOT NULL REFERENCES "ai_mcp_connection"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL REFERENCES "ai_chat_thread"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tool_execution_id" text REFERENCES "ai_agent_tool_execution"("id") ON DELETE SET NULL,
  "external_tool_name" text NOT NULL,
  "schema" jsonb NOT NULL,
  "sample" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "row_count" integer NOT NULL DEFAULT 0,
  "byte_size" integer NOT NULL DEFAULT 0,
  "truncated" boolean NOT NULL DEFAULT false,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_dataset_limits_check" CHECK ("row_count" BETWEEN 0 AND 10000 AND "byte_size" BETWEEN 0 AND 26214400)
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_dataset_owner_expiry_idx" ON "ai_mcp_dataset" ("workspace_id", "user_id", "thread_id", "expires_at");
--> statement-breakpoint
CREATE TABLE "ai_mcp_dataset_chunk" (
  "id" text PRIMARY KEY NOT NULL,
  "dataset_id" text NOT NULL REFERENCES "ai_mcp_dataset"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "rows" jsonb NOT NULL,
  "row_count" integer NOT NULL,
  "byte_size" integer NOT NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_dataset_chunk_dataset_index_unique" UNIQUE ("dataset_id", "chunk_index")
);
--> statement-breakpoint
CREATE TABLE "ai_mcp_materialization" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "agent_profile_id" text NOT NULL REFERENCES "ai_agent_profile"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL REFERENCES "ai_chat_thread"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "ai_job_id" text REFERENCES "ai_job"("id") ON DELETE SET NULL,
  "database_id" text,
  "data_source_id" text,
  "name" text NOT NULL,
  "mapping" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "completed_rows" integer NOT NULL DEFAULT 0,
  "failed_rows" integer NOT NULL DEFAULT 0,
  "error_code" varchar(80),
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "ai_mcp_materialization_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_materialization_job_idx" ON "ai_mcp_materialization" ("ai_job_id");
--> statement-breakpoint
CREATE TABLE "ai_mcp_materialization_reservation" (
  "id" text PRIMARY KEY NOT NULL,
  "materialization_id" text NOT NULL REFERENCES "ai_mcp_materialization"("id") ON DELETE CASCADE,
  "dataset_id" text NOT NULL REFERENCES "ai_mcp_dataset"("id") ON DELETE CASCADE,
  "source_row_index" integer NOT NULL,
  "row_id" text NOT NULL,
  "page_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'reserved',
  "error_code" varchar(80),
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "ai_mcp_materialization_reservation_status_check" CHECK ("status" IN ('reserved', 'inserted', 'failed')),
  CONSTRAINT "ai_mcp_materialization_source_row_unique" UNIQUE ("materialization_id", "dataset_id", "source_row_index"),
  CONSTRAINT "ai_mcp_materialization_row_id_unique" UNIQUE ("row_id"),
  CONSTRAINT "ai_mcp_materialization_page_id_unique" UNIQUE ("page_id")
);
--> statement-breakpoint
CREATE INDEX "ai_mcp_materialization_reservation_status_idx" ON "ai_mcp_materialization_reservation" ("materialization_id", "status", "source_row_index");
