# Server runtime

## Interface and flow

Hono app creation installs request context and session middleware before feature route composition. Node entrypoints attach static assets and websocket handlers around that application.

Start at the [entrypoint](../../apps/server/src/app/index.ts); follow the [implementation](../../apps/server/src/infrastructure/runtime/runtime-adapter.ts) and [related modules](../../apps/server/src/app/node).

## Invariants and failure handling

The runtime adapter supplies optional capabilities with capability-specific fallback/error rules. runWithRuntimeAdapter scopes an adapter using AsyncLocalStorage; setRuntimeAdapter supplies a process fallback. Preserve the distinction for concurrent requests.

## Verification

See [tests or test configuration](../../apps/server/src/app) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
