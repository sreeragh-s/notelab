# Offline documents

## Owning modules and interface

- [apps/web/src/features/offline](../../../apps/web/src/features/offline)

## Main flow

Offline providers coordinate connectivity and local document availability. Document modules manage persistence, recovery and protected structure. Authentication, origins, transport and diagnostics come from the platform interface. App session composition supplies mail-cache preparation before namespace deletion; offline owns its document/manifest lifecycle.

## Authorization and persistence

Local storage is scoped to server/account ownership and is separate from server authority. Offline availability does not authorize a write that the server would reject; network code rejects unsupported offline mutations.

## Side effects, failures and recovery

Reconnect and server replacement destroy old connections and selectively clear cached data. Preserve recovery snapshots, ownership and teardown order, especially when switching accounts or servers.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/offline/offline-recovery.test.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Local runtime connectivity

Local desktop probes the loopback service even when the OS reports no internet.
React Query connectivity follows service reachability. Native Quit requests wait for
active document persistence and provider synchronization; a failure preserves recovery
state and keeps the application open. Closing the local window hides it without
stopping jobs. Saved-profile switching flushes active local documents first.
