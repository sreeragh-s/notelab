# Server runtime

## Interface and flow

Hono app creation installs request context and session middleware before feature route composition. Node entrypoints attach static assets and websocket handlers around that application.

Start at the [entrypoint](../../apps/server/src/app/index.ts); follow the [implementation](../../apps/server/src/infrastructure/runtime/runtime-adapter.ts) and [related modules](../../apps/server/src/app/node).

## Invariants and failure handling

The runtime adapter supplies optional capabilities with capability-specific fallback/error rules. runWithRuntimeAdapter scopes an adapter using AsyncLocalStorage; setRuntimeAdapter supplies a process fallback. Preserve the distinction for concurrent requests.

Shared [HTTP input handling](../../apps/server/src/shared/http/auth.ts) authenticates before parsing required JSON objects, including the existing array acceptance. Feature routes retain operation-specific validation and authorization. The pure [SHA-256 encoder](../../apps/server/src/shared/crypto/sha256.ts) is shared by provider credentials and OAuth state hashing; encryption, credentials and provider lifecycle remain feature-owned.

## Verification

See [tests or test configuration](../../apps/server/src/app) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Internal organization

[Runtime contracts](../../apps/server/src/infrastructure/runtime/contracts.ts) contain the adapter interface and wire payloads; [runtime context](../../apps/server/src/infrastructure/runtime/runtime-context.ts) owns process fallback and request-scoped selection. The existing runtime-adapter entrypoint re-exports that interface for compatibility and implements capability behavior. Meeting and database realtime wire types live in [shared contracts](../../apps/server/src/shared/contracts), with compatibility type re-exports at the feature entrypoints. Infrastructure no longer imports feature implementations or feature-owned wire declarations.

The [app binding declaration](../../apps/server/src/shared/types.ts) intentionally infers session types from the authentication feature and exposes the canonical Drizzle database type for edition hooks. These are type-only contracts, with a focused `server-bindings` dependency exception; concrete runtime modules do not import authentication implementation code.
