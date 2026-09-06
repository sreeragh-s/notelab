# Database automations

## Owning modules and interface

- [apps/server/src/features/databases/automations](../../../apps/server/src/features/databases/automations)
- [apps/web/src/features/databases/automations](../../../apps/web/src/features/databases/automations)
- [packages/features/src/databases/automations](../../../packages/features/src/databases/automations)

## Main flow

Definition lifecycle compiles and validates automations. Triggers and schedules produce durable work. The run engine claims work, loads pinned execution context, executes actions and records results; the web manager edits definitions and displays history.

## Authorization and persistence

Definitions/revisions, runs, step runs, receipts and secrets live in Postgres. Execution rechecks access and uses the pinned revision. Provider connections and protected configuration remain owner-scoped.

## Side effects, failures and recovery

External actions can send Gmail/Slack messages or webhooks. Retries must reuse delivery identities and receipts. Leases, revision pinning, permission denial and provider reconnect states are part of the execution interface.

## Focused guides

- [Automation execution lifecycle](execution.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/databases/automations/operations.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
