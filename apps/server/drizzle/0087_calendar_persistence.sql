CREATE TABLE "calendar_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"google_subject" text NOT NULL,
	"email" text NOT NULL,
	"secret" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	CONSTRAINT "calendar_account_status" CHECK ("calendar_account"."status" in ('connected', 'reconnect_required'))
);

CREATE TABLE "calendar_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text NOT NULL
);

CREATE TABLE "calendar_event_record" (
	"account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"generation" integer NOT NULL,
	CONSTRAINT "calendar_event_record_account_id_calendar_id_event_id_pk" PRIMARY KEY("account_id","calendar_id","event_id")
);

CREATE TABLE "calendar_mutation_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"binding_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"calendar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "calendar_notification_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"revision" integer NOT NULL,
	"generation" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "calendar_oauth_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"verifier" jsonb NOT NULL,
	"client_kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "calendar_oauth_attempt_state_hash_unique" UNIQUE("state_hash")
);

CREATE TABLE "calendar_preference" (
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "calendar_preference_user_id_workspace_id_pk" PRIMARY KEY("user_id","workspace_id")
);

CREATE TABLE "calendar_provider_calendar" (
	"account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"sync_token" text,
	"page_token" text,
	"generation" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"lease_id" text,
	"lease_expires_at" timestamp with time zone,
	"dirty_at" timestamp with time zone,
	CONSTRAINT "calendar_provider_calendar_account_id_calendar_id_pk" PRIMARY KEY("account_id","calendar_id")
);

CREATE TABLE "calendar_range_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"generation" integer NOT NULL,
	"revision" integer NOT NULL,
	"events" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "calendar_watch_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"calendar_id" text,
	"token_hash" text NOT NULL,
	"resource_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);

CREATE UNIQUE INDEX "calendar_account_owner_subject" ON "calendar_account" USING btree ("user_id","google_subject");
CREATE UNIQUE INDEX "calendar_account_owner_id" ON "calendar_account" USING btree ("id","user_id");
CREATE UNIQUE INDEX "calendar_binding_scope" ON "calendar_binding" USING btree ("user_id","workspace_id","account_id");
ALTER TABLE "calendar_account" ADD CONSTRAINT "calendar_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_binding" ADD CONSTRAINT "calendar_binding_account_id_user_id_calendar_account_id_user_id_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."calendar_account"("id","user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_binding" ADD CONSTRAINT "calendar_binding_workspace_id_user_id_member_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."member"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_event_record" ADD CONSTRAINT "calendar_event_record_account_id_calendar_id_calendar_provider_calendar_account_id_calendar_id_fk" FOREIGN KEY ("account_id","calendar_id") REFERENCES "public"."calendar_provider_calendar"("account_id","calendar_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_mutation_receipt" ADD CONSTRAINT "calendar_mutation_receipt_binding_id_calendar_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."calendar_binding"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_notification_outbox" ADD CONSTRAINT "calendar_notification_outbox_account_id_calendar_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."calendar_account"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_oauth_attempt" ADD CONSTRAINT "calendar_oauth_attempt_workspace_id_user_id_member_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."member"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_preference" ADD CONSTRAINT "calendar_preference_workspace_id_user_id_member_workspace_id_user_id_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."member"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_provider_calendar" ADD CONSTRAINT "calendar_provider_calendar_account_id_calendar_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."calendar_account"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_range_snapshot" ADD CONSTRAINT "calendar_range_snapshot_account_id_calendar_id_calendar_provider_calendar_account_id_calendar_id_fk" FOREIGN KEY ("account_id","calendar_id") REFERENCES "public"."calendar_provider_calendar"("account_id","calendar_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "calendar_watch_channel" ADD CONSTRAINT "calendar_watch_channel_account_id_calendar_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."calendar_account"("id") ON DELETE cascade ON UPDATE no action;
