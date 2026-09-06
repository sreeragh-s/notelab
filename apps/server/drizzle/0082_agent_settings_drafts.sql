CREATE TABLE ai_settings (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
 scope text NOT NULL, definition jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id, scope)
);
CREATE TABLE ai_settings_draft (
 id text PRIMARY KEY, settings_id text NOT NULL REFERENCES ai_settings(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, definition jsonb NOT NULL,
 base_version integer NOT NULL, draft_version integer NOT NULL DEFAULT 1, pending_run text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(settings_id, user_id)
);
CREATE TABLE ai_settings_version (
 id text PRIMARY KEY, settings_id text NOT NULL REFERENCES ai_settings(id) ON DELETE CASCADE,
 definition jsonb NOT NULL, version integer NOT NULL,
 created_by_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(settings_id, version)
);
ALTER TABLE ai_mcp_oauth_attempt ADD COLUMN return_to text;
