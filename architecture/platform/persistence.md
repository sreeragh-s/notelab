# Persistence

## Interface and flow

The database module creates pooled self-hosted connections or standalone runtime connections and exposes a context-scoped Drizzle client. runWithDb marks its scope inactive after the callback; streaming work needs runWithIndependentDbEnv.

Start at the [entrypoint](../../apps/server/src/infrastructure/database/index.ts); follow the [implementation](../../apps/server/src/infrastructure/database/schema.ts) and [related modules](../../apps/server/drizzle).

## Invariants and failure handling

Feature operations own transactions and access decisions. Schema declarations define tables, defaults, indexes and relationships; migration history is append-only. A structural schema move must produce identical metadata and no migration.

## Verification

See [tests or test configuration](../../apps/server/src/test-support) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
