# User settings

## Owning modules and interface

- [apps/server/src/features/user-settings](../../../apps/server/src/features/user-settings)
- [apps/web/src/features/settings](../../../apps/web/src/features/settings)
- [packages/features/src/user-settings](../../../packages/features/src/user-settings)

## Main flow

User settings routes persist page/layout and profile preferences. Shared sidebar configuration and web settings presentation apply those preferences across navigation and page screens.

## Authorization and persistence

Preferences belong to the authenticated user. Workspace and teamspace administration remain in their feature modules, even when the same settings shell displays them.

## Side effects, failures and recovery

Profile image changes use storage; preference changes invalidate the relevant client state. Preserve stored keys/defaults and distinguish user preferences from resource authorization.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/user-settings) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
