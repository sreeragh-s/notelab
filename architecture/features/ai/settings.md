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
