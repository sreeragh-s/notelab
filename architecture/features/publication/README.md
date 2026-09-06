# Publication and sharing

## Owning modules and interface

- [apps/web/src/features/pages/publication](../../../apps/web/src/features/pages/publication)
- [apps/server/src/features/pages/page-sharing-routes.ts](../../../apps/server/src/features/pages/page-sharing-routes.ts)
- [apps/server/src/features/databases/sharing](../../../apps/server/src/features/databases/sharing)

## Main flow

Page sharing routes control publication while public web surfaces resolve published preferences and share access. Database sharing integrates with page-backed content and teamspace security.

## Authorization and persistence

Published visibility is distinct from authenticated membership. Persisted sharing settings and effective teamspace public-sharing policy govern access; public page composition must not expose authenticated-only controls.

## Side effects, failures and recovery

Publishing/unpublishing changes who can read content. Preserve public URLs, share failures, breadcrumbs and access behavior after revocation.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/test/features/pages/published-share-access.test.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
