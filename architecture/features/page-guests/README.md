# Page guests

## Owning modules and interface

- [apps/server/src/features/page-guests](../../../apps/server/src/features/page-guests)
- [Invitation acceptance screen](../../../apps/web/src/features/pages/screens/accept-page-invitation.tsx)

## Main flow

Guest workflows submit invitations or approval requests, approve/reject them, accept invitations, and revoke or promote guests. These operations coordinate membership behavior with page-specific grants. Invitation lookup and accept live at `/page-guest-invitations/:invitationId` and are Node API paths.

## Authorization and persistence

Guest invitations, requests, workspace guests and page access are persisted separately. Invite policy, requesting authority, email match and invitation expiry determine whether a transition is allowed.

## Side effects, failures and recovery

Accepting or revoking an invitation changes access; notification/email delivery is downstream of the operation. Preserve pending-state, expiry and normalized email rules. Workspace guest status must not become unrestricted membership.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/page-guests/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
