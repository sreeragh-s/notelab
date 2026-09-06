# Navigation

## Owning modules and interface

- [apps/web/src/features/sidebar](../../../apps/web/src/features/sidebar)
- [apps/server/src/features/workspaces/navigation-realtime](../../../apps/server/src/features/workspaces/navigation-realtime)
- [packages/features/src/pages](../../../packages/features/src/pages)

## Main flow

Sidebar models derive visible sections and page/database navigation; actions change content or selection. Workspace navigation realtime propagates invalidations through an outbox and shared event/cache logic.

## Authorization and persistence

Navigation reflects accessible content and user sidebar preferences. Page graph/hierarchy ownership stays with page modules; sidebar visibility is not a server authorization decision.

## Side effects, failures and recovery

Hierarchy changes and workspace switches invalidate navigation state. Preserve expansion, ordering, recency, selected view and realtime reconciliation while separating actions from rendering.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/navigation-realtime.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
