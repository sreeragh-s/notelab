# Teamspaces

## Owning modules and interface

- [apps/server/src/features/teamspaces](../../../apps/server/src/features/teamspaces)
- [apps/web/src/features/teamspaces](../../../apps/web/src/features/teamspaces)
- [packages/features/src/teamspaces](../../../packages/features/src/teamspaces)

## Main flow

[Teamspace membership](../../../apps/server/src/features/teamspaces/teamspace-membership.ts) owns default membership and principal removal through the existing TeamspaceService interface. Teamspace management owns organization of workspace content; policy, security and integrity modules resolve visibility and membership constraints. Web screens present team access and settings using shared queries.

## Authorization and persistence

Teamspaces, principals and team membership live in Postgres. Security policy controls public sharing, guests and export on associated pages/databases. Content operations must resolve policy for the content being accessed.

## Side effects, failures and recovery

Management changes can affect content ownership and navigation. Integrity checks protect associations; preserve transaction and authorization behavior when reorganizing management implementation.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/teamspaces/integrity.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
