# Mail synchronization and delivery

[Gmail gateway](../../../apps/server/src/features/mail/provider/gmail-gateway.ts) is the provider-facing implementation. [Sync](../../../apps/server/src/features/mail/sync/mail-sync.ts), [index](../../../apps/server/src/features/mail/query/mail-index.ts), watch renewal and Pub/Sub handling have distinct responsibilities. The index background task advances the account and schedules another attempt until index state is ready.

[Composition](../../../apps/server/src/features/mail/compose/mail-compose.ts) owns message delivery behavior. [Credentials](../../../apps/server/src/features/mail/provider/security/mail-credentials.ts) remain server-side. [Database sync worker](../../../apps/server/src/features/mail/database-sync/mail-database-sync-worker.ts) drains an outbox independently of ordinary message indexing.

The [web storage](../../../apps/web/src/features/mail/storage), [sync](../../../apps/web/src/features/mail/sync) and [realtime](../../../apps/web/src/features/mail/realtime) models coordinate local presentation. Account ownership and per-user concurrency apply before provider operations. A connection requiring reconnection is a durable state, not a reason to keep retrying with invalid credentials indefinitely.

Cover repeated provider events, checkpoint continuation, expired credentials, duplicate send attempts, and account/server cache isolation. Use controlled gateway adapters in tests. [Gmail deployment](../../../docs/mail/gmail-deployment.md) is the operational source for provider setup.

## Browser synchronization and recovery

The [mail controller](../../../apps/web/src/features/mail/sync/mail-sync-controller.ts) owns connectivity, React loading/error state, cache subscriptions and reconnect scheduling. [Cache synchronization](../../../apps/web/src/features/mail/sync/mail-cache-sync.ts) reads the loaded-view cursor, constructs incremental/page/search requests, gathers known IDs for recovery, calls transport and applies records/checkpoints through the existing cache transaction. Search does not mark a view loaded. The transport function is supplied by the controller; tests use a controlled response with the same database operations.

[Mutation recovery](../../../apps/web/src/features/mail/sync/mail-mutations.ts) owns single-thread and single-message optimistic snapshots, applying provider responses and queuing reconciliation. Both ordinary label changes and trash/restore actions use these operations. Definite `ApiError` responses in the 4xx range restore the prior snapshot; uncertain failures retain optimistic changes and queue reconciliation. Batch operations and label operations retain their distinct sequencing. The controller still owns offline guards and its mutating indicator. Account/server cache closure remains in app composition.

Server [mailbox synchronization](../../../apps/server/src/features/mail/sync/mail-sync.ts) drains history pages for a response, while [index advancement](../../../apps/server/src/features/mail/query/mail-index.ts) bounds each advance and persists continuation tokens. Their event selection and checkpoint timing differ, so they retain separate loops. Provider authentication, per-user concurrency, watches and database-sync outbox leases remain with their existing owners.

## Composition receipts

[Send composition](../../../apps/server/src/features/mail/compose/mail-compose.ts) keeps draft creation/update and send delivery behind its existing exported functions. Private receipt reservation owns operation identity checks and insert races. A shared completion function records the provider message ID before loading and normalizing the full message. Normal sends, known receipts and recovered ambiguous sends use that same sequence. Completion remains awaited inside the send's error-handling scope; loading a sent message retains the existing failure semantics.

The [send tests](../../../apps/server/src/features/mail/compose/mail-compose.test.ts) cover stable-ID deduplication, draft delivery, cross-user/account rejection, fresh versus stale pending receipts, ambiguous recovery and definite provider failure/retry. [Cache recovery tests](../../../apps/web/test/features/mail/mail-mutation-recovery.test.mjs) use real Dexie operations with fake IndexedDB and a controlled transport to cover rollback/reconciliation and cursor/search behavior. They do not prove real provider delivery or PostgreSQL claim contention.

[Mail overview](README.md).

OAuth account credential upsert and workspace binding commit in one transaction. OAuth completion and disconnect serialize per Zilobase user using a PostgreSQL transaction advisory lock, so a concurrent binding cannot race last-binding revocation. Credential ciphertext repaired after an upsert conflict is never visible before commit.
