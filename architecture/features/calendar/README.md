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

The lazy `/calendar` screen uses the existing workspace shell and shared controls. Account queries are scoped by workspace, have finite freshness and surface errors. Preferences persist per member/workspace with IANA zone validation. The application sidebar offers a fixed Calendar tab beside Mail only under its independent web feature flag. Route navigation, including OAuth returns, selects that tab. The screen uses the same pane shell and sidebar toggle as Mail, centering the Google Calendar connection prompt when no accounts are connected. The lazily loaded [account sidebar](../../../apps/web/src/features/calendar/connections/calendar-accounts-sidebar.tsx) renders a shared mini date picker, connected accounts, calendar visibility, reconnect and disconnect controls. Date selection preserves the schedule view; the Add calendar account row opens the shared Google-only connection dialog. Account/calendar rows reuse the shared sidebar actions and dropdowns, with eye visibility controls and account-menu disconnect. The catalog selects and persists a writable primary default when needed; event creation uses the same resolver. These controls live in the application sidebar; the schedule fills the center pane.

Calendar preference JSON also stores local color overrides and removed-calendar keys, scoped by binding/calendar identity. Older records normalize to empty additions. Calendar menus use shared inline submenus and the shared removal confirmation dialog. Eye visibility is temporary; removal hides the row and events until restored in Calendar settings. Both leave Google unchanged. A removed default is replaced using the shared writable-calendar resolver. Explicit event colors take precedence over local calendar colors.

## Synchronization

[Incremental synchronization](../../../apps/server/src/features/calendar/sync/sync.ts) leases one provider page at a time, atomically commits canonical records and checkpoints, and emits a revision outbox record only at the final page. Expired tokens start a new generation; old records survive until the replacement completes. The [Calendar background handler](../../../apps/server/src/features/calendar/background.ts) advances unfinished calendars and drains committed outbox revisions immediately. Minute-based maintenance remains the durable recovery path. The existing `calendar.sync` task accepts an account/calendar pair, with a null calendar identifying a calendar-list refresh. Removed provider calendars produce a final invalidation before deletion.

[Range retrieval](../../../apps/server/src/features/calendar/sync/ranges.ts) uses provider-expanded occurrences and ownership-bound, expiring snapshot cursors. Range responses rebind only workspace and binding identity; request-window fields must never overwrite an event’s structured start/end times. Partial pages never replace complete browser ranges. Captured revisions prevent concurrent changes from being incorrectly acknowledged. Search does not change sync checkpoints.

## Browser storage

[Dexie storage](../../../apps/web/src/features/calendar/storage/calendar-database.ts) isolates each server/user/workspace/binding. Completed range membership and event records commit together; older generations/revisions and cross-identity payloads are rejected. Cache reads distinguish unloaded, empty, and stale ranges. Monthly LRU eviction retains pending mutation records. App session composition closes Calendar and Mail databases before offline-store deletion. Account disconnect removes only its own Calendar cache.

[Cache synchronization](../../../apps/web/src/features/calendar/sync/calendar-cache-sync.ts) serializes per binding and coalesces equal requests. IndexedDB is authoritative for event presentation; account and preference queries use TanStack Query.

## Views and time

The Calendar schedule composes account cache subscriptions into day/week grids, month cells and an agenda. Date/view and scoped event selection live in route search parameters. Day and Week use the [period scroller](../../../apps/web/src/shared/components/calendar/calendar-period-scroller.tsx) to snap horizontally at each displayed day column. Crossing a full period updates the route and recenters the bounded buffer while retaining the vertical time position. Date labels and a persistent all-day row follow the horizontal viewport continuously, including before snapping settles. Wheel gestures over that pinned header take the dominant axis: vertical motion scrolls the time body and does not page, while horizontal motion pages the period. The all-day disclosure collapses cards into per-day event counts; either the disclosure or a count expands them again. This local display state survives period navigation, and toggling it preserves both scroll offsets. The schedule loads the adjacent periods into the same bounded cache range. The fixed-height center pane gives Day, Week, Month and Agenda their own vertical scroll area with `overscroll-y-none` so those viewports do not bounce or chain vertically into the page, while Day/Week horizontal paging still chains from the time grid; Day/Week headers and all-day events stay outside the scrolling body, and the timezone rail stays outside horizontal paging while its time labels track the body’s vertical offset. Month view scrolls through a bounded moving window of weeks, virtualizes offscreen rows, and preserves the visible date and pixel offset when extending in either direction. The route and mini calendar follow the visible month; explicit date navigation resets the window around that month. Month event windows split into contiguous requests of at most 60 days to stay within the server’s 62-day limit, and browser range coverage composes the resulting snapshots. Event details render provider descriptions as text. [Time utilities](../../../packages/features/src/calendar/time.ts) use Temporal for IANA conversion, reject ambiguous/nonexistent input unless explicitly disambiguated, and preserve date-only all-day values. Overlap intervals are end-exclusive.

## Event writes

[Mutation services](../../../apps/server/src/features/calendar/events/mutations.ts) reserve request-hashed operation receipts before provider calls. Creates use deterministic provider IDs; existing events require matching ETags. Provider failures distinguish definite rejection from uncertain delivery. Status lookup reconciles private operation markers or confirmed deletion without replaying writes. Permission checks and account ownership precede delivery. Successful receipts and revision invalidations commit together.

## Editing and optimistic recovery

The event editor uses shared controls and explicit guest-update settings. Calendar writes require connectivity. [Browser mutations](../../../apps/web/src/features/calendar/events/calendar-mutations.ts) persist optimistic snapshots before transport; definite rejection rolls back, while ambiguous delivery remains pending for operation-status reconciliation. Event creation and deletion update range membership transactionally. An online controller periodically reconciles persisted operations.

## Recurrence

[Series operations](../../../apps/server/src/features/calendar/events/series-split.ts) persist the original series ETag and deterministic successor before modifying Google. Status reconciliation reads operation markers, resumes missing steps, and never repeats a successful insert. Following-occurrence edits truncate the original rule and reset later exceptions, matching Google's split model. Single-RRULE count limits are adjusted using provider instances; complex imported rule sets remain unchanged and reject splitting. Whole-series changes translate the edited occurrence's wall-clock delta back to the master in its IANA zone. The editor preserves imported recurrence unless the user explicitly replaces it.

## Push and runtime delivery

[Watch maintenance](../../../apps/server/src/features/calendar/realtime/watches.ts) registers independent calendar-list and event channels, persists a token digest before contacting Google, and accepts authenticated early callbacks. Monotonic message numbers discard replays. Event callbacks mark canonical streams dirty; list callbacks remain durable until metadata refresh. After committing these markers, authenticated non-replayed callbacks dispatch the existing background task immediately. Dispatch failure leaves markers available to maintenance; webhook handlers do not wait for Google event fetching. Renewal registers replacements before stopping old channels; abandoned channels expire.

[Outbox delivery](../../../apps/server/src/features/calendar/realtime/outbox.ts) claims committed invalidations and retries failures with backoff. It resolves current account bindings at delivery time and sends only scoped revisions. Node attaches `/calendar-realtime` to the existing realtime bus. Calendar HMAC tickets have a separate signing domain, five-minute lifetime, and binding/account/user/workspace claims. Realtime tickets also report the earliest active provider-watch coverage expiry, including the calendar-list channel and every readable event channel. Missing or expired coverage selects fallback polling independently of socket connectivity. Sockets speak `calendar.ready`, `calendar.ping`, `calendar.pong`, and `calendar.invalidate`; event contents never enter the bus. Runtime contracts and ticket verification are published through the server adapter and realtime entrypoints.

## Browser recovery

[Recovery coordination](../../../apps/web/src/features/calendar/realtime/calendar-recovery.ts) shares one reference-counted coordinator across schedule/reminder consumers and holds a Web Lock for the binding's socket leader and uses BroadcastChannel for scoped invalidations and health. The leader sends 20-second heartbeats, renews expiring tickets and reconnects with bounded backoff. Visible online clients check provider changes every minute without healthy push or about five minutes when both socket health and provider-watch coverage are valid, with jitter and failure backoff. Focus, visibility and connectivity recovery also check Google. Separate provider and range locks coalesce concurrent tabs. Invalidation-driven refreshes read the ownership-checked `/connections/:bindingId/catalog` metadata cache before ranges and update sidebar queries without starting another canonical sync. This propagates renamed/removed calendars without provider feedback loops. Routine sync/timezone status is omitted from the schedule header; offline and actionable errors remain visible. Late component responses cannot replace current loading/error state.

## Running-app reminders

The lazy [application reminder host](../../../apps/web/src/features/calendar/reminders/calendar-reminder-host.tsx) sits outside route content and subscribes to each enabled account's upcoming cache. It continues through navigation and checks deadlines on a timer and after focus/visibility restoration. Calendar defaults and popup overrides determine deadlines; declined, cancelled and ended events are excluded. [Atomic IndexedDB claims](../../../apps/web/src/features/calendar/reminders/scheduler.ts) deduplicate delivery across tabs and survive restarts. Editing the start produces a new reminder identity; pending provider mutations cannot notify.

In-app delivery is always available when reminders are enabled. System delivery uses browser Notification permission or the [Tauri notification plugin](https://v2.tauri.app/plugin/notification/), requested only from Calendar settings. The scheduler does not register closed-app alarms, service-worker push, or native scheduled notifications. Disconnection deletes its scoped cache and reminder claims; logout removes the session host.

Cached range coverage can be composed from adjacent snapshots, so switching from a loaded month to a day or week reads existing occurrences immediately. The controller prefetches the current and adjacent monthly buckets after the active request. Eviction pins ranges containing unresolved mutations as well as the current request.

## Acceptance corrections

The month view lays multi-day bars across weekly lanes with overflow details. Day/week grids support 15-minute creation, transient drag previews and all-day resizing; provider delivery occurs on drop. Indexed day bounds and cached time formatters keep cached navigation independent of event normalization costs. Separate editor, timing, status and layout modules keep these responsibilities isolated.

Provider transport and durable receipt storage are separate from mutation orchestration. Pending writes serialize by provider account across workspace bindings. Moves first persist an operation marker with an ETag fence, allowing uncertain delivery to reconcile the destination safely. Following edits at the first occurrence update the existing series. Google Meet pending/failure states remain visible without treating a saved event as lost.

## Rollout and observability

The authenticated configuration endpoint reports boolean readiness for independent OAuth/encryption settings, callback/webhook URLs and background/realtime capabilities. Structured server metrics and local browser custom events contain numeric measurements and outcomes only, without event or user identifiers. [The deployment runbook](../../../docs/calendar-deployment.md) documents pilot configuration, automated gates, manual Google acceptance and reversible disablement. General availability stays disabled until live web/desktop acceptance passes.

## Workspace controls

The [workspace controller](../../../apps/web/src/features/calendar/workspace/calendar-workspace.tsx)
owns period-bounded search and panel actions. Date and view remain route parameters.
The [toolbar](../../../apps/web/src/features/calendar/workspace/calendar-toolbar.tsx) is
rendered in `PagePaneHeader`'s padded action slot, with compact search/navigation
menus at narrow widths. The schedule renders a plain month heading on the leading edge and Create event on the trailing edge;
date picking remains in the left mini calendar.

Calendar row buttons only receive focus. Visibility and its pressed state belong
to the eye button; hidden names use the shared secondary text token. A flex action
area allocates space for the eye and expands for the options button on hover,
focus, or menu-open state, keeping the Default label intact.

## Event dock

The existing [details and editor](../../../apps/web/src/features/calendar/views/calendar-event-panel.tsx)
render into a stable portal element owned by the workspace controller. Calendar
registers close/create actions and retains event, mutation, and draft state. The
shell mounts the element in its shared resizable dock or mobile overlay. Moving
the same element between hosts preserves the editor across breakpoints and AI
switches. Hidden content is inert. Calendar and AI are mutually exclusive even
when AI uses its saved floating presentation; switching does not rewrite that
preference. Explicit close clears route selection and restores trigger focus;
leaving Calendar resets registration and search state.

## Event presentation

Timed cards use a single full-height click target with title and time range;
awaiting invitations have a dashed outline. Drag/resize handles retain their
existing geometry behavior. The [event details](../../../apps/web/src/features/calendar/views/calendar-event-details.tsx)
surface is part of the same event dock: time, timezone, recurrence status,
participant counts/preview, inline participant expansion and RSVP, meeting link,
location/description, calendar, visibility and reminders. Shared avatars, buttons,
button groups, compact settings typography, and section borders define its appearance.
The dock uses the shared control sizes and secondary-text tokens; editor labels
stack above fields while checkbox rows retain their horizontal layout. RSVP and management controls
reuse the existing mutation flow; expansion does not open another panel or alter
selection. Notes/database linking and proposal workflows are not implemented.

## Reusable calendar surface

The [CalendarSurface entrypoint](../../../apps/web/src/shared/components/calendar/index.ts) owns Month, Week, Day and Agenda rendering and local scrolling/drag state. Callers supply plain items with unique IDs, titles, exclusive-end timing, styling and explicit editability, plus controlled date/view and display preferences. Optional callbacks report requested instant ranges, selection, creation, proposed timing changes and geometry errors. Custom renderers replace card contents while the surface retains interaction semantics. Each instance is independent; the surface has no router, account, persistence or global keyboard subscriptions.

The schedule adapts provider events using composite event keys and handles search, cache range loading, permissions, routing, editors and writes. Geometry callbacks merge only start/end into the original provider event. Provider-free [calendar layout utilities](../../../packages/features/src/calendar-layout/index.ts) own timezone and layout calculations; the existing Calendar package exports remain compatibility facades. [Standalone browser fixtures](../../../scripts/calendar/e2e/surface-fixture.tsx) exercise reuse without application providers. Database view registration remains separate.
