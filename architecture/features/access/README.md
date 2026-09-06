# Access decisions

## Owning modules and interface

- [apps/server/src/features/access](../../../apps/server/src/features/access)
- [apps/server/src/features/pages/graph](../../../apps/server/src/features/pages/graph)

The [feature interface](../../../apps/server/src/features/access/index.ts) explicitly separates [principal lookup](../../../apps/server/src/features/access/principal-access.ts), [effective resource access](../../../apps/server/src/features/access/effective-access.ts), [access-level rules](../../../apps/server/src/features/access/access-level.ts), and [HTTP workspace mismatch handling](../../../apps/server/src/features/access/workspace-mismatch.ts). Resource calculations do not import Hono or request context. Principal lookup retains the active-membership predicate and the existing short guest realtime expiry. Transport checks preserve the 409 response and its stable code.

## Main flow

Access functions combine membership, page hierarchy, explicit grants and teamspace security to resolve effective page/database access. Agent access and pinned agent snapshots have their own entrypoints.

## Authorization and persistence

The access module reads resource and principal records; access-level defines ranking and normalization. A page record, workspace membership, and permission to edit that page are different facts. Preserve guest/public/agent distinctions.

## Side effects, failures and recovery

Access checks may load the page graph and multiple grants. Revoked or expired membership and active-workspace mismatch must remain observable failures. Keep batch access queries efficient when changing calculation shape.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/access/access.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
