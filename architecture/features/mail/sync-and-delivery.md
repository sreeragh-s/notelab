# Mail synchronization and delivery

[Gmail gateway](../../../apps/server/src/features/mail/provider/gmail-gateway.ts) is the provider-facing implementation. [Sync](../../../apps/server/src/features/mail/sync/mail-sync.ts), [index](../../../apps/server/src/features/mail/query/mail-index.ts), watch renewal and Pub/Sub handling have distinct responsibilities. The index background task advances the account and schedules another attempt until index state is ready.

[Composition](../../../apps/server/src/features/mail/compose/mail-compose.ts) owns message delivery behavior. [Credentials](../../../apps/server/src/features/mail/provider/security/mail-credentials.ts) remain server-side. [Database sync worker](../../../apps/server/src/features/mail/database-sync/mail-database-sync-worker.ts) drains an outbox independently of ordinary message indexing.

The [web storage](../../../apps/web/src/features/mail/storage), [sync](../../../apps/web/src/features/mail/sync) and [realtime](../../../apps/web/src/features/mail/realtime) models coordinate local presentation. Account ownership and per-user concurrency apply before provider operations. A connection requiring reconnection is a durable state, not a reason to keep retrying with invalid credentials indefinitely.

Cover repeated provider events, checkpoint continuation, expired credentials, duplicate send attempts, and account/server cache isolation. Use controlled gateway adapters in tests. [Gmail deployment](../../../docs/mail/gmail-deployment.md) is the operational source for provider setup.

[Mail overview](README.md).
