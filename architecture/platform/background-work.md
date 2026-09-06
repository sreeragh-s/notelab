# Background work

## Interface and flow

The processor maps task kinds to automation, agent, AI-job, mail, realtime and notification operations. It records queue/execution telemetry and converts pending outbox state into completed or retry outcomes. Node coordination supplies dispatch and maintenance.

Start at the [entrypoint](../../apps/server/src/app/background/processor.ts); follow the [implementation](../../apps/server/src/infrastructure/background/contracts.ts) and [related modules](../../apps/server/src/app/node/background-coordinator.ts).

## Invariants and failure handling

Feature implementations own leases, receipts, authorization and durable status. Dispatch success is not equivalent to feature completion. Retries preserve task identity and availableAt semantics; terminal outcomes differ from thrown execution errors.

## Verification

See [tests or test configuration](../../apps/server/src/infrastructure/background) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Dispatch seam

The processor delegates mail indexing/sync, database realtime, navigation realtime and notification tasks to each feature's background module. Those modules own the post-drain persistence checks and retry deadlines. [Task result handling](../../apps/server/src/infrastructure/background/task-result.ts) shares the identical completed/retry interpretation of an outbox row; it does not claim work or change leases. [Processor tests](../../apps/server/src/app/background/processor.test.ts) exercise the dispatch interface before and after the move. Node websocket attachment remains separate for each protocol.
