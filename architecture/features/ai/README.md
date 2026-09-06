# AI conversations and agents

## Owning modules and interface

- [apps/server/src/features/ai](../../../apps/server/src/features/ai)
- [apps/web/src/features/ai](../../../apps/web/src/features/ai)
- [packages/features/src/ai-chat](../../../packages/features/src/ai-chat)

## Main flow

Chat/thread routes connect conversations to agent execution, context, tools and files. Shared contracts describe conversations and settings; the web conversation adapter owns transport and live client state.

## Authorization and persistence

Agent profiles, revisions, conversations, runs, settings drafts and connector access are separate persisted concerns. Tools resolve actor/resource authority on the server; client visibility is not permission to execute.

## Side effects, failures and recovery

Streaming work, draft flushing, tool approvals and queued runs have different lifetimes. MCP outbound requests use the pinned transport. Preserve cancellation, permission failures and recovery instead of treating all execution as a single request.

## Focused guides

- [Agent execution and MCP](execution-and-mcp.md)
- [Settings drafts and publication](settings.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/ai) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
