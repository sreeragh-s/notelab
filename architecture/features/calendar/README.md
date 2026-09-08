# Calendar

Calendar contracts live in [the shared package](../../../packages/features/src/calendar/index.ts). Event identity includes workspace, binding, provider calendar and event. All-day dates use an exclusive end; timed events preserve IANA zones and recurrence identity.

The server requires both `CALENDAR_ENABLED=true` and a matching `CALENDAR_ENABLED_WORKSPACE_IDS` entry (or `*`). The web uses the independent `VITE_FEATURE_CALENDAR` flag, disabled by default. Calendar authorization never follows the Mail flag.

Contract model tests exercise identity isolation and safe route construction. Configuration tests cover independent workspace rollout.

## Persistence and ownership

[Calendar tables](../../../apps/server/src/infrastructure/database/schema/calendar.ts) keep account credentials separate from Mail. Composite foreign keys require bindings to match both account ownership and workspace membership. [Ownership operations](../../../apps/server/src/features/calendar/connections/ownership.ts) reject expired memberships and serialize disconnect with account binding changes. Disconnect removes credentials only when the last binding is removed.

The disposable PostgreSQL runner is `node scripts/calendar/test-integration.mjs`; it creates and drops a uniquely named local database and applies the migration journal before testing.

## Provider connection

[Routes](../../../apps/server/src/features/calendar/routes.ts) require feature rollout, active membership and account ownership. Callback routes use expiring single-use OAuth state and PKCE. [Google OAuth](../../../apps/server/src/features/calendar/provider/oauth.ts) uses independent Calendar credentials and encrypted, owner-bound secrets. Google identity verification is shared platform code; Mail retains its published compatibility entrypoint.

`CALENDAR_GOOGLE_CLIENT_ID`, `CALENDAR_GOOGLE_CLIENT_SECRET`, and a base64 32-byte `CALENDAR_TOKEN_ENCRYPTION_KEY` configure connections. Register `/calendar/oauth/google/callback` on the canonical API origin. Browser callbacks return to `/calendar`; desktop callbacks carry server/instance identity through the existing deep-link protocol. The combined Node runtime recognizes callback prefixes without treating the `/calendar` web screen as an API route.

## Web shell

The lazy `/calendar` screen uses the existing workspace shell and shared controls. Account queries are scoped by workspace, have finite freshness and surface errors. Preferences persist per member/workspace with IANA zone validation. The application sidebar offers Calendar only under its independent web feature flag.

## Synchronization

[Incremental synchronization](../../../apps/server/src/features/calendar/sync/sync.ts) leases one provider page at a time, atomically commits canonical records and checkpoints, and emits a revision outbox record only at the final page. Expired tokens start a new generation; old records survive until the replacement completes. Background tasks and maintenance recovery advance unfinished calendars.

[Range retrieval](../../../apps/server/src/features/calendar/sync/ranges.ts) uses provider-expanded occurrences and ownership-bound, expiring snapshot cursors. Partial pages never replace complete browser ranges. Captured revisions prevent concurrent changes from being incorrectly acknowledged. Search does not change sync checkpoints.

## Browser storage

[Dexie storage](../../../apps/web/src/features/calendar/storage/calendar-database.ts) isolates each server/user/workspace/binding. Completed range membership and event records commit together; older generations/revisions and cross-identity payloads are rejected. Cache reads distinguish unloaded, empty, and stale ranges. Monthly LRU eviction retains pending mutation records. App session composition closes Calendar and Mail databases before offline-store deletion. Account disconnect removes only its own Calendar cache.

[Cache synchronization](../../../apps/web/src/features/calendar/sync/calendar-cache-sync.ts) serializes per binding and coalesces equal requests. IndexedDB is authoritative for event presentation; account and preference queries use TanStack Query.

## Views and time

The Calendar schedule composes account cache subscriptions into day/week grids, month cells and an agenda. Date/view and scoped event selection live in route search parameters. Event details render provider descriptions as text. [Time utilities](../../../packages/features/src/calendar/time.ts) use Temporal for IANA conversion, reject ambiguous/nonexistent input unless explicitly disambiguated, and preserve date-only all-day values. Overlap intervals are end-exclusive.

## Event writes

[Mutation services](../../../apps/server/src/features/calendar/events/mutations.ts) reserve request-hashed operation receipts before provider calls. Creates use deterministic provider IDs; existing events require matching ETags. Provider failures distinguish definite rejection from uncertain delivery. Status lookup reconciles private operation markers or confirmed deletion without replaying writes. Permission checks and account ownership precede delivery. Successful receipts and revision invalidations commit together.
