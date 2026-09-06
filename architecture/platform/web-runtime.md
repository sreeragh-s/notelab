# Web runtime

## Interface and flow

Feature providers supply the shared client with authentication and request behavior. The request implementation currently lives under desktop/network even for browser callers. It resolves origins, adds credentials, handles timeouts, rejects unsupported offline writes and applies hosted-demo behavior.

Start at the [entrypoint](../../apps/web/src/app/providers/features-provider.tsx); follow the [implementation](../../apps/web/src/features/desktop/network/api.ts) and [related modules](../../apps/web/src/features/offline).

## Invariants and failure handling

Features receive the provider interface; routing and provider ordering belong to app composition. Desktop server replacement also clears query and offline state, so changing this ordering can leak data between servers.

## Verification

See [tests or test configuration](../../apps/web/test/shared/api.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
