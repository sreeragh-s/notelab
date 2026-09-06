# Memberships

## Owning modules and interface

- [apps/server/src/features/memberships](../../../apps/server/src/features/memberships)

## Main flow

MembershipService owns membership changes and edition integration. The temporary-membership module supplies active membership conditions and expiry behavior reused by access and guest workflows.

## Authorization and persistence

Membership records associate users with workspaces and roles. Callers must distinguish active membership from a row that exists but has expired. Database transactions can supply the concrete database dependency.

## Side effects, failures and recovery

Grants, revocations and expiry affect downstream access. Keep edition callbacks and temporary membership transitions in the owning module rather than copying membership writes into callers.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/memberships/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
