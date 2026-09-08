# Calendar

Calendar contracts live in [the shared package](../../../packages/features/src/calendar/index.ts). Event identity includes workspace, binding, provider calendar and event. All-day dates use an exclusive end; timed events preserve IANA zones and recurrence identity.

The server requires both `CALENDAR_ENABLED=true` and a matching `CALENDAR_ENABLED_WORKSPACE_IDS` entry (or `*`). The web uses the independent `VITE_FEATURE_CALENDAR` flag, disabled by default. Calendar authorization never follows the Mail flag.

Contract model tests exercise identity isolation and safe route construction. Configuration tests cover independent workspace rollout.

## Persistence and ownership

[Calendar tables](../../../apps/server/src/infrastructure/database/schema/calendar.ts) keep account credentials separate from Mail. Composite foreign keys require bindings to match both account ownership and workspace membership. [Ownership operations](../../../apps/server/src/features/calendar/connections/ownership.ts) reject expired memberships and serialize disconnect with account binding changes. Disconnect removes credentials only when the last binding is removed.

The disposable PostgreSQL runner is `node scripts/calendar/test-integration.mjs`; it creates and drops a uniquely named local database and applies the migration journal before testing.
