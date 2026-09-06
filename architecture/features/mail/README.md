# Mail

## Owning modules and interface

- [apps/server/src/features/mail](../../../apps/server/src/features/mail)
- [apps/web/src/features/mail](../../../apps/web/src/features/mail)
- [packages/features/src/mail](../../../packages/features/src/mail)

[Background task implementation](../../../apps/server/src/features/mail/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

Provider callbacks connect Gmail accounts. Workspace routes expose connection, query, organization, sync, message and realtime operations. Sync/index modules build queryable local state; database synchronization uses its own outbox worker.

## Authorization and persistence

Gmail accounts, bindings, index state and mail organization records are persisted. Feature rollout and workspace context gate routes; connection ownership and encrypted credentials remain server concerns.

## Side effects, failures and recovery

Sending, watch renewal and provider synchronization are external effects. Preserve per-user concurrency, checkpoints, receipts, reconnect_required states and duplicate-event handling. Mail routes apply private/no-store and referrer/security headers even on failures.

## Focused guides

- [Mail synchronization and delivery](sync-and-delivery.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/mail/sync/mail-sync.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Capability map

The [server route composition](../../../apps/server/src/features/mail/routes.ts) retains middleware and route order. [Connection routes](../../../apps/server/src/features/mail/connections/routes.ts) bind accounts and handle OAuth callbacks; [provider modules](../../../apps/server/src/features/mail/provider) own Gmail transport, OAuth, message normalization and credential/token security. [Sync](../../../apps/server/src/features/mail/sync) owns history synchronization, watches and Pub/Sub delivery. [Query](../../../apps/server/src/features/mail/query) owns indexing and indexed queries, including the existing combined query/sync HTTP routes.

[Compose](../../../apps/server/src/features/mail/compose) owns MIME, delivery, safe unsubscribe and message operations. [Organization](../../../apps/server/src/features/mail/organization) owns persisted views, properties and reminders. [Database sync](../../../apps/server/src/features/mail/database-sync) owns configuration and outbox execution; [realtime](../../../apps/server/src/features/mail/realtime) owns tickets and its route. Shared transport parsing/ownership checks remain in `route-support.ts`; metrics and per-user concurrency remain small feature-level modules. Background dispatch still enters through `background.ts`.

The browser [mail screen](../../../apps/web/src/features/mail/screens/mail.tsx) composes these capabilities. [Mailbox](../../../apps/web/src/features/mail/mailbox) renders list/chrome, [messages](../../../apps/web/src/features/mail/messages) owns thread loading, viewing and actions, and [compose](../../../apps/web/src/features/mail/compose) owns composer state/rendering. [Organization](../../../apps/web/src/features/mail/organization), [connections](../../../apps/web/src/features/mail/connections) and [database sync](../../../apps/web/src/features/mail/database-sync) contain their focused controls. [Storage](../../../apps/web/src/features/mail/storage), [sync](../../../apps/web/src/features/mail/sync) and [realtime](../../../apps/web/src/features/mail/realtime) retain distinct cache, connection and coordination lifetimes.

Shared mail contracts/queries/React entrypoints remain in the existing package. Published [background adapter exports](../../../apps/server/src/public/adapter-api.ts) and [realtime exports](../../../apps/server/src/public/realtime-api.ts) point to the owning capabilities without changing exported names. Provider formats, cache names, HTTP paths and security headers remain unchanged. [Route inventory tests](../../../apps/server/src/features/mail/route-inventory.test.ts) exercise actual composed routes; adjacent tests move with their implementations, and web tests remain under the feature test root.
