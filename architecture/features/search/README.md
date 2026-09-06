# Search

## Owning modules and interface

- [apps/server/src/features/search](../../../apps/server/src/features/search)
- [packages/features/src/search](../../../packages/features/src/search)
- [apps/web/src/features/sidebar/app-search.tsx](../../../apps/web/src/features/sidebar/app-search.tsx)

## Main flow

searchWorkspaceItems normalizes a query and searches indexed content, returning page/database navigation results and excerpts. Shared queries connect the sidebar search surface to server routes.

## Authorization and persistence

Search documents are persisted in Postgres. The implementation filters accessible pages and database results using membership and resource access; search must not disclose inaccessible titles or excerpts.

## Side effects, failures and recovery

Query limits and excerpt marker handling are part of the result interface. Empty/normalized queries and stale or removed content must preserve current behavior.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/search/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
