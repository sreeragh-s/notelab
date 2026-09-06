# Pages

## Owning modules and interface

- [apps/server/src/features/pages](../../../apps/server/src/features/pages)
- [apps/web/src/features/pages](../../../apps/web/src/features/pages)
- [packages/features/src/pages](../../../packages/features/src/pages)

## Main flow

The page route composition mounts browse, visit, hierarchy, sharing, content and lifecycle routes in order. Web page composition selects authenticated, guest or public presentation and embeds the editor. Shared queries and mutation hooks coordinate cache state.

## Authorization and persistence

Pages, placements, access grants and collaboration documents represent different concerns. Server handlers resolve resource access before reads/writes. Page lock and layout preferences also influence presentation and permitted editing.

## Side effects, failures and recovery

Writes can change hierarchy, database associations and navigation state. Preserve route ordering, optimistic rollback, structural content and editor lifecycle when separating presentation from commands.

## Client mutation ownership

Page mutations are grouped by access, guests, placement, content/lifecycle and activity. The [legacy mutation entrypoint](../../../packages/features/src/pages/mutation-hooks.ts) preserves exports; React bindings select each operation family directly. Access mutations share invalidation of detail and access queries; guest invitation/request invalidation remains distinct. Content and favorite rollbacks retain their existing snapshot scopes.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/pages/content-state.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
