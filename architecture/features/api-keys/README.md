# API keys

## Owning modules and interface

- [apps/server/src/features/api-keys](../../../apps/server/src/features/api-keys)
- [packages/features/src/api-keys](../../../packages/features/src/api-keys)

## Main flow

Key routes integrate Better Auth key management with request authentication. The [API-key settings screen](../../../apps/web/src/features/settings/screens/api-keys.tsx) owns creation/revocation presentation in the settings shell; [key operations](../../../apps/server/src/features/api-keys/api-keys.ts) remain independent of that presentation. Header parsing recognizes the existing nl_ key prefix; key metadata can scope a caller to a workspace.

## Authorization and persistence

Key records are persisted through the authentication integration. A workspace-scoped key must not act in another workspace; rejectMismatchedApiKeyWorkspace performs the explicit mismatch check.

## Side effects, failures and recovery

Creation and revocation change credentials. Preserve expiry and prefix compatibility. Malformed headers and invalid metadata are handled by the key parsing interface, not by guessing a workspace.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/api-keys/api-keys.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
