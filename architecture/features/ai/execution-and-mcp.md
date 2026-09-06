# Agent execution and MCP

[Agent modules](../../../apps/server/src/features/ai/agents) own profiles/revisions, resources and triggers. [Conversations](../../../apps/server/src/features/ai/conversations) own conversation state; [execution](../../../apps/server/src/features/ai/execution) owns durable run orchestration, records, leases and checkpoints. [Jobs](../../../apps/server/src/features/ai/jobs) implement queued AI work. [Background composition](../../../apps/server/src/app/background/processor.ts) dispatches agent.run and ai.job tasks to those implementations.

[MCP modules](../../../apps/server/src/features/ai/mcp) own connector access, OAuth, tool discovery, tool snapshots, approval and execution. The model's requested tool is not itself authorization: actor scope, connection access and tool execution mode constrain what can run. [Pinned Node transport](../../../apps/server/src/app/node/pinned-mcp.ts) is the concrete secure outbound mechanism; the [runtime adapter](../../../apps/server/src/infrastructure/runtime/runtime-adapter.ts) rejects MCP requests when the required transport is absent.

[Tool implementations](../../../apps/server/src/features/ai/tools) apply page/database operations and [file routes](../../../apps/server/src/features/ai/files/routes.ts) handle AI file interactions. Resource permissions and persisted run state remain server-owned. Web conversation state renders streaming output and approvals; it must not duplicate the server's execution policy.

When changing this flow, cover permission denial, approval requirements, cancellation, connector revocation and durable run recovery. Preserve existing tool names and shared contracts. Tests beside agent/MCP modules are the implementation-level starting point; the [operations guide](../../../docs/ai/ask-ai-operations.md) describes runtime diagnosis.

[AI overview](README.md).
