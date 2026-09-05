# MCP and Custom Agents branch review — 2026-09-06

## Status

**Not merge-ready.** This pass ran branch-wide automated checks and reviewed
selected security, runtime, and UI ownership paths. It is not a claim that every
line or every application workflow has been verified. Neither repository has
been merged to `main`, pushed, or deployed. Existing local encrypted environment
changes were left untouched and excluded from these commits.

## Fixed in this pass

- Removed all 23 reported import cycles by separating run queueing from
  execution/event persistence, and OAuth credential management from discovery.
- Moved AI settings out of the obsolete global settings hierarchy into
  `apps/web/src/features/ai/components/settings`. Instructions, sharing,
  connectors, and workspace policy each have a canonical component owner.
- Removed obsolete custom-profile creation/settings branches from Personal
  Ask AI and the unused global Custom Agents management component.
- Added run-lease renewal, a bounded attempt deadline, durable ownership checks
  before tool invocation, and cancellation-safe failure bookkeeping.
- Enforced the agent execution kill switch when processing already-queued runs
  and approving agent MCP actions, not just when creating runs.
- Serialized run-event sequence allocation by locking the parent run; duplicate
  trigger deliveries no longer append duplicate `queued` events.
- Redacted raw provider diagnostics from shared run summaries.
- Failed closed when retrying a run with prior write receipts, instead of
  restarting the model and potentially issuing the write again.
- Captured MCP tool/schema/classification identities and approval requirements
  when queueing runs. Execution intersects these with current grants; enabling
  a connector or relaxing confirmation later does not expand a queued run.
  Legacy queued runs without this snapshot cannot use MCP: start a fresh run.
- Rechecked thread/run ownership, live write policy, and agent lifecycle before
  MCP I/O, and rejected policies changed since tool selection. Approval completion
  now preserves concurrent run cancellation.
- Released ignored redirect response streams and rejected local hostname
  aliases such as `localhost.` and single-label intranet names.
- Removed an unused direct MCP dependency and patched transitive `browserslist`
  and `fast-uri` advisories. The audit no longer reports high/critical issues.

## Remaining merge blockers

1. **Durable approval continuation is incomplete.**
   `mcp/mcp-approval.ts`, `executeApprovedMcpRunAction`, marks a run succeeded
   after one approved tool result. It does not resume the rest of the saved run.
   Implement durable model/tool-result
   checkpoints and test multiple approvals, cancellation, and queue redelivery.

2. **Coverage fails the existing repository gate.**
   Latest measured server coverage: statements 41.19%, branches 36.78%,
   functions 43.34%, lines 42.77%. Required: 45%, 40%, 45%, 45% respectively.
   Existing source-string contract tests do not establish runtime ACL,
   idempotency, or migration correctness. Add behavioral database-backed tests,
   especially for grants, OAuth/approvals, trigger delivery, and materialization.
   Do not lower thresholds or exclude these services.

3. **New complexity findings remain.**
   `quality:fallow:health` fails its identity baseline. Examples include MCP
   approval execution, `processAgentRun`, database event dispatch,
   materialization, and Custom Agent Settings. Split validation, persistence,
   orchestration, and presentation at their existing domain boundaries; do not
   regenerate the baseline to absorb the new findings.

## Verification recorded

- Server suite: 768 tests passed before the final additional approval-gate test.
- Focused MCP/agent/Node egress suites: 70 tests passed after the final
  capability-snapshot and execution-context changes; server typecheck passed.
- Web typecheck and source-contract suite passed during the refactor.
- Full core verification passed earlier stages, including the web production
  build/bundle budget, then failed server coverage.
- Dead-code/boundary gate: zero unresolved imports, cycles, unused exports,
  unused dependencies, or boundary violations after cleanup.
- Duplication remained approximately 2.2%, below the 3% ceiling.
- Cloudflare adapter: build, 93 normal tests, 22 Workers tests, and generated
  binding type check passed.
- Dependency audit after patching: 49 remaining advisory entries (48 moderate,
  one low); dependency-chain entries are not 49 independent vulnerabilities.
  These still require reachability assessment and coordinated editor upgrades.

Not performed in this pass: production deployment, live negative SSRF/provider
smokes, authenticated cross-member ACL end-to-end scenarios, a fresh production
migration/self-host upgrade test, or desktop Rust verification. No secrets or
real user content should be used as test fixtures.

## Source ownership after cleanup

- `agents/agent-run-queue.ts`: reservation and dispatch; no model/native tools.
- `agents/agent-run-records.ts`: ordered events and response serialization.
- `agents/agent-run-lease.ts`: bounded execution ownership and tool guarding.
- `agents/agent-run-service.ts`: run lifecycle and model orchestration.
- `mcp/oauth.ts`: authorization initiation and callback orchestration.
- `mcp/oauth-credentials.ts`: client registrations, refresh, and revocation.
- `mcp/mcp-errors.ts`: common domain error, without service dependencies.
- Web `ai/components/settings`: domain-owned settings presentation; shared
  page-side-pane and design-system components remain the common UI foundation.

The Workers review followed the current
[Cloudflare guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
The native Worker transport and shared Postgres ownership were preserved.
