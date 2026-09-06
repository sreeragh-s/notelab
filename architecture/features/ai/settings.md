# Settings drafts and publication

## Interface

[Settings routes](../../../apps/server/src/features/ai/settings/routes.ts) resolve a SettingsActor from authenticated user, workspace and scope. Scope is personal or an agent profile identifier. Custom-agent routes require their feature configuration. [Shared contracts](../../../packages/features/src/ai-chat/settings-contract.ts) define definitions, drafts, versions and review state.

The [settings implementation](../../../apps/server/src/features/ai/settings/settings-service.ts) exposes readSettings, updateSettingsDraft, discardSettingsDraft, settingsVersions and publishSettings. Version-bearing mutations carry baseVersion and draftVersion. Conflict responses are part of the interface; callers must reload rather than overwrite silently.

## Flow and persistence

Initial reads authorize the actor and establish a settings baseline from current profile, resources, triggers and connector tools. Saved settings and saved versions are distinct from a user's draft. Instruction pages provide collaborative content and are hydrated into definitions; they are not merely a textarea field in the draft table.

The [draft hook](../../../apps/web/src/features/ai/settings/use-settings-draft.ts) owns queued writes, local recovery, polling and cross-tab invalidation. Callers flush pending drafts before conversation or connector actions that depend on current settings. Publishing validates resource/connector authority and materializes runtime profile, trigger and grant state.

## Change safety

Preserve version conflict detection, draft ownership, instruction-page synchronization and transactional publication. Keep provider effects separate from local draft state. Tests should cover two writers, stale base/draft versions, denied resources, publish/discard, and flush-before-action ordering. Follow adjacent tests under the [settings implementation directory](../../../apps/server/src/features/ai/settings).

[AI overview](README.md).

## Implementation boundary

The explicit `settings-service.ts` interface preserves its exported names. [Access](../../../apps/server/src/features/ai/settings/settings-access.ts) owns actor scope, authorization and connector-scope predicates. [Baseline loading](../../../apps/server/src/features/ai/settings/settings-baseline.ts) initializes saved settings from the existing profile/preferences, resources, triggers and connectors. [Reads](../../../apps/server/src/features/ai/settings/settings-read.ts) compose hydrated saved/draft state and version history; [definition rules](../../../apps/server/src/features/ai/settings/settings-definition.ts) merge instructions and compare canonical content.

[Draft operations](../../../apps/server/src/features/ai/settings/settings-draft.ts) own updates, instruction creation and discard. Their private instruction-page creator writes both the page and Yjs document inside the caller's transaction, preserving the duplicate-submission check before page creation. [Version coordination](../../../apps/server/src/features/ai/settings/settings-versioning.ts) locks the saved settings row and loads only the acting user's draft. Update, discard and publication share this mechanism while retaining their distinct conflict decisions; ordinary reads remain unlocked.

[Publication](../../../apps/server/src/features/ai/settings/settings-publication.ts) orchestrates hydration, validation, materialization, saved-version creation and draft removal inside the existing transaction. [Validation](../../../apps/server/src/features/ai/settings/settings-validation.ts) checks resource grants, trigger configuration/access, connector ownership/tool availability and uniqueness in the established order. [Materialization](../../../apps/server/src/features/ai/settings/settings-materialization.ts) updates the profile/revision, desired triggers, resource/share grants and connector policies as one publication. The version increments only for a changed definition; repeating an already-completed save retains its existing semantics.

The [settings service tests](../../../apps/server/src/features/ai/settings/settings-service.test.ts) exercise private drafts, stale versions, duplicate instruction creation, AI review/discard, publication idempotency and rollback through the unchanged interface. Additional pre-refactor cases cover revoked resource grants, connector authenticator restrictions and invalid custom schedules. Baseline migration tests cover one-time personal instruction import, inaccessible legacy pages, custom-agent version preservation and missing profiles. Draft review derivation and personal-scope validation remain private rules in draft operations. Browser draft flushing and its queue remain in the existing draft hook; this server refactor does not alter flush-before-action ordering.
