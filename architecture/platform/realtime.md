# Realtime

## Interface and flow

Page collaboration, database mutation events, mail updates and workspace navigation invalidations have separate attachment modules. Their tickets, events and recovery are owned by the corresponding feature implementations.

Start at the [entrypoint](../../apps/server/src/app/node); follow the [implementation](../../apps/server/src/features/collaboration) and [related modules](../../apps/server/src/features/databases/realtime).

## Invariants and failure handling

Preserve authorization at ticket creation and connection/use time where implemented. Outbox delivery can be repeated; callers must retain their existing revision/deduplication and reconnect behavior. Do not unify distinct event protocols merely because each uses websockets.

## Verification

See [tests or test configuration](../../apps/server/src/features/collaboration/service.test.ts) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
