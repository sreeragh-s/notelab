# Databases

## Owning modules and interface

- [apps/server/src/features/databases](../../../apps/server/src/features/databases)
- [apps/web/src/features/databases](../../../apps/web/src/features/databases)
- [packages/features/src/databases](../../../packages/features/src/databases)

[Background task implementation](../../../apps/server/src/features/databases/realtime/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

Database routes compose reads, rows, properties and data-source operations. The web database surface derives a view model and commands from shared payloads; feature mutations coordinate optimistic state and realtime invalidation.

## Authorization and persistence

A database is page-backed; data sources, rows, views and property values are separate persisted concepts. Resource and data-source access checks constrain mutations. Formula and value rules also have shared implementations.

## Side effects, failures and recovery

Row/property changes can update realtime outboxes, automations and page navigation. Preserve mutation origin and transaction ordering. Database realtime revisions and cache reconciliation prevent stale UI after writes.

## Focused guides

- [Database mutation and realtime flow](realtime.md)
- [Database views and properties](views-and-properties.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/databases/database-routes.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
