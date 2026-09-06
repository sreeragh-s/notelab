# Workspaces

## Owning modules and interface

- [apps/server/src/features/workspaces](../../../apps/server/src/features/workspaces)
- [apps/web/src/features/workspaces](../../../apps/web/src/features/workspaces)
- [packages/features/src/workspaces](../../../packages/features/src/workspaces)

## Main flow

Workspace queries and hooks support workspace selection and invitations. Server routes integrate the authenticated principal with workspace settings and navigation invalidation. App providers coordinate active-workspace selection with authentication.

## Authorization and persistence

Workspace and membership records anchor feature ownership. Active-workspace checks and scoped key checks are separate from resource-level access. Workspace settings belong to the settings submodule.

## Side effects, failures and recovery

Workspace changes invalidate navigation and client queries. Invitation links cross authentication and routing. Follow navigation-realtime outbox behavior when changing hierarchy or membership side effects.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/workspaces/active-workspace.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
