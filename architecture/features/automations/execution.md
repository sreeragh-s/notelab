# Automation execution lifecycle

[Run engine](../../../apps/server/src/features/databases/automations/execution/run-engine.ts) claims durable work and renews its lease under the worker identity. [Execution context](../../../apps/server/src/features/databases/automations/execution/execution-context.ts) loads the pinned revision and resources; [action executor](../../../apps/server/src/features/databases/automations/execution/action-executor.ts) selects the concrete action implementation.

Step receipts use a stable run/action identity. A succeeded receipt can restore the output rather than repeat the action. Retrying work retains its revision and idempotency identity. Updating a definition after a run is queued must not change that run's instructions.

Internal mutations recheck data-source access and preserve automation origin. External Gmail, Slack and webhook actions have distinct connection ownership, credential and retry behavior. Webhooks use pinned egress; [the runbook](../../../docs/databases/automation-operations-runbook.md) and [threat model](../../../docs/databases/automation-threat-model.md) describe operations and security constraints.

A lost lease must not let an old worker complete another worker's claim. Terminal failure updates run and automation state; skipped work differs from failed work. Preserve scheduled occurrence context, workspace concurrency and step receipts when changing implementation shape.

Existing [architecture assertions](../../../apps/server/src/features/databases/automations/execution/run-engine-architecture.test.ts) check many of these conditions as source strings. They do not prove races or idempotency at runtime. Refactoring the engine requires behavioral tests for duplicate delivery, lease loss/recovery, pinned revisions and external retries before removing those assertions.

[Automation overview](README.md).
