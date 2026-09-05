# Standalone Custom Agents

Custom Agents are workspace objects, not Ask AI profiles. Universal Ask AI
remains personal and uses the current member's permissions, preferences,
Instruction pages, Skill pages, and personal MCP connections. Custom Agents are
opened at `/agents/:agentId`, use a shared builder/run timeline, and inherit none
of those personal capabilities.

## Security boundary

- Every agent is an independent ACL principal (`target_type = 'agent'`).
- A new agent starts with no pages, databases, creation destination, or MCP
  connection.
- Page grants inherit through normal child-page hierarchy. Inline databases
  inherit their containing page's agent grant; standalone databases require an
  explicit database grant.
- Agent access resolution never falls back to the owner, creator, invoking user,
  workspace membership, teamspace defaults, or public access.
- View grants require the grantor to view the resource. Comment and edit grants
  require the grantor to have full human access.
- Native run tools recheck the agent principal before reading a page or database.
  Page updates, database-cell updates, comments, and child-page creation also
  recheck edit/comment access immediately before mutation and publish the normal
  collaboration, database, navigation, and audit effects.
  External tools resolve only the agent's own MCP connections.
- Capability expansion is accepted only through explicit resource, sharing, and
  connector controls. Builder chat never applies those changes from inferred or
  untrusted content.

## Revisions and builder chat

The canonical agent definition is immutable once written. Every authorized
configuration change creates an `ai_agent_revision`, updates
`current_revision_id` transactionally, and adds a shared revision card. Revert
creates another revision instead of deleting history.

Builder messages are classified server-side as `configure`, `run`,
`configure_and_run`, or `clarify`. Only owner/editor roles can apply inferred
configuration. Ambiguous messages ask a question and do not mutate or execute.
The same revision service handles Settings edits.

## Durable runs

Manual and triggered executions create `ai_agent_run` records and ordered
`ai_agent_run_event` entries. Each run stores the exact revision and resource
permission snapshot. Node claims `agent.run` tasks through the PostgreSQL
coordinator; Cloudflare consumes the same task from Queues. Failures are leased
and retryable, cancellation is durable, event receipts deduplicate trigger
delivery, and chain depth prevents recursion.

Run workers renew their lease every 20 seconds and enforce a five-minute model
attempt deadline. Every newly invoked tool checks durable lease ownership.
Cancellation stops further invocations; an already-issued remote write cannot
be undone. A retry that finds a previous write receipt fails closed with
`AGENT_RETRY_REQUIRES_REVIEW`, because model/tool-result checkpoints are not yet
implemented. Inspect the previous outcome before manually starting another run.

MCP writes retain the existing write kill switches and approval model.
Background calls that require confirmation put the run into
`waiting_approval`. Provider results, tool arguments, and sensitive diagnostics
are never placed in shared activity.

Background approval continuation remains incomplete: the current approval
handler records the approved tool result as the final run result rather than
resuming the remaining model steps. Do not enable background write workflows
that depend on multi-step approval continuation until this is implemented and
tested. See the [branch review](./mcp-branch-review.md) for merge blockers.

## Triggers

The materialized trigger contract covers manual, schedule, database, comment,
mention, meeting, webhook, Slack, and curated connector kinds. Manual runs,
portable schedule polling, database row-added/removed/property-changed events, page
comments and explicit mentions, meeting completion, and signed inbound webhooks
have runtime handlers. They all enter the same deduplicated `acceptAgentEvent`
boundary. Webhook delivery uses rotatable encrypted secrets, timestamp
validation, and replay receipts.

Slack and curated connector events are intentionally unavailable until their
provider-specific signed event adapters are installed and configured. Declaring
a trigger kind does not turn an outbound Slack OAuth connection or an arbitrary
MCP endpoint into an inbound event source.

MCP servers expose tools only. Connector event triggers require a curated,
provider-specific signed event adapter. GitHub events require a GitHub App
webhook installation separate from the OAuth application used for GitHub MCP.

## UI and compatibility

- Home's New menu creates an `Untitled agent` and opens its page.
- Agents appear in the main sidebar, Library/Recents, and global search.
- The page-style agent surface has Chat, Activity, and Settings tabs.
- `/ai` has no agent selector or Add Agent action.
- Existing agent-bound Ask AI threads remain private and read-only and appear in
  a private legacy-history section beneath that agent's shared Chat.
- Deprecated `AiAgentProfile*` contracts are aliases during migration; the
  public product terminology is Custom Agent.

## Deployment flags

All flags default to disabled:

```text
AI_CUSTOM_AGENTS_ENABLED=false
AI_CUSTOM_AGENT_TRIGGERS_ENABLED=false
AI_CUSTOM_AGENT_EXTERNAL_EVENTS_ENABLED=false
AI_CUSTOM_AGENT_EXECUTION_DISABLED=false
```

Deploy migration `0080_standalone_custom_agents.sql` before enabling the UI.
Enable manual runs first, schedules/native events second, external webhook and
connector adapters third, and automatic external writes last. Emergency rollback
sets `AI_CUSTOM_AGENT_EXECUTION_DISABLED=true`; stored agents and revisions stay
intact.
