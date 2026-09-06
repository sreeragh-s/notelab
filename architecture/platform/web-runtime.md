# Web runtime

## Interface and flow

Feature providers supply the shared client with authentication and request behavior. The request implementation lives under platform/network for both browser and desktop callers. It resolves origins, adds credentials, handles timeouts, rejects unsupported offline writes and applies hosted-demo behavior.

Start at the [entrypoint](../../apps/web/src/app/providers/features-provider.tsx); follow the [implementation](../../apps/web/src/platform/network/api.ts) and [related modules](../../apps/web/src/features/offline).

## Invariants and failure handling

Features receive the provider interface; routing and provider ordering belong to app composition. Desktop server replacement also clears query and offline state, so changing this ordering can leak data between servers.

## Verification

See [tests or test configuration](../../apps/web/test/shared/api.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

Transport, runtime detection, server-origin resolution, credentials and diagnostics live under [platform](../../apps/web/src/platform). Desktop feature entrypoints temporarily re-export the existing interface. [Application request composition](../../apps/web/src/app/runtime/configure-requests.ts) installs offline and demo policy before startup. The transport captures one policy per request; interception runs before network checks, observations run only after transport outcomes, and overlays run after successful response parsing. Timeouts and cancellation bypass connectivity failure handling. Platform code imports no feature implementations.
