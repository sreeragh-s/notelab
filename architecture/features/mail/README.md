# Mail

## Owning modules and interface

- [apps/server/src/features/mail](../../../apps/server/src/features/mail)
- [apps/web/src/features/mail](../../../apps/web/src/features/mail)
- [packages/features/src/mail](../../../packages/features/src/mail)

## Main flow

Provider callbacks connect Gmail accounts. Workspace routes expose connection, query, organization, sync, message and realtime operations. Sync/index modules build queryable local state; database synchronization uses its own outbox worker.

## Authorization and persistence

Gmail accounts, bindings, index state and mail organization records are persisted. Feature rollout and workspace context gate routes; connection ownership and encrypted credentials remain server concerns.

## Side effects, failures and recovery

Sending, watch renewal and provider synchronization are external effects. Preserve per-user concurrency, checkpoints, receipts, reconnect_required states and duplicate-event handling. Mail routes apply private/no-store and referrer/security headers even on failures.

## Focused guides

- [Mail synchronization and delivery](sync-and-delivery.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/mail/mail-sync.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
