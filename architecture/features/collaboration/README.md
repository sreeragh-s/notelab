# Collaboration

## Owning modules and interface

- [apps/server/src/features/collaboration](../../../apps/server/src/features/collaboration)
- [apps/web/src/features/editor/collaboration](../../../apps/web/src/features/editor/collaboration)

## Main flow

The collaboration implementation handles page/meeting document transformations and persistence. Node runtime attachment exposes the websocket transport; the web editor consumes collaborative documents through its lifecycle modules.

## Authorization and persistence

Persisted collaboration documents and page content have coordinated representations. Ticket security and resource access constrain participation; a websocket connection is not an unrestricted content-writing credential.

## Side effects, failures and recovery

Concurrent editing, reconnect, document replacement and comment/transcript updates cross this seam. Preserve Yjs semantics and the distinction between ordinary request database scopes and longer-lived work.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/collaboration/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
