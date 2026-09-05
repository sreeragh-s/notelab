# MCP and Custom Agents branch review — 2026-09-06

## Status

**Automated merge gates pass.** This pass ran branch-wide automated checks and reviewed
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

## Remaining release checks

No known automated merge blocker remains. Production rollout still requires the
live security, migration, and cross-member scenarios listed below. Passing these
gates is not proof that every runtime workflow is defect-free.

## Blocker follow-up

- Implemented encrypted model/tool-result checkpoints. Approved tools now
  persist their results and resume the remaining model conversation, rather
  than marking the run complete after one tool. Multiple approvals wait for
  all results; cancelled/failed runs do not resume. Missing legacy checkpoints
  fail closed. Native-only agent runs also require the configured encryption
  keyring because their model history may contain private workspace data.
- Added atomic tool-call reservations, cumulative MCP receipt quotas, and
  recovery for trigger receipts reserved before queue submission failed.
- Fixed personal connector quotas accidentally counting other workspaces,
  departed members retaining profile access, failed MCP handshakes not closing
  their client, and concurrent profile edits reading a stale revision before
  acquiring the update lock.
- Server coverage now passes the unchanged thresholds: statements 45.38%,
  branches 41.23%, functions 47.14%, lines 46.71%. Added behavioral tests for
  orchestration, encryption, approvals, membership, triggers, and MCP clients.
  These tests mock database/provider boundaries; they are not a substitute for
  real Postgres concurrency tests or authenticated end-to-end permission tests.
- Split MCP approval validation and chat result presentation into focused
  helpers. Import-job queries preserve their scoped query keys and now pass
  TanStack Query cancellation signals to the request.
- No coverage threshold, source exclusion, or complexity baseline was relaxed.
- Split remaining orchestration, validation, materialization, OAuth, and settings
  render paths at their domain boundaries. Settings state remains mounted across
  tabs; shared page-pane and sharing components remain authoritative.
- Health/audit now generate fresh server coverage before measuring CRAP scores,
  rather than assuming tested functions have zero coverage. Three runner tests
  verify coverage precedes analysis and failure prevents stale scoring. Structural
  complexity thresholds and the identity baseline are unchanged.
- Bounded streamed inbound agent webhook bodies before signature processing;
  chunked oversized requests now fail with 413 instead of buffering indefinitely.
- Fixed agent OAuth returns to use the standalone agent Tools settings route,
  including failures; personal returns remain under Ask AI.
- Full `verify:core` and `verify:architecture` pass. There are no unbaselined
  health findings; inherited legacy debt remains visible in reports.

## Verification recorded

- Follow-up server suite: 920 tests passed; the separate query regression suite
  passed 278 tests, followed by server typecheck/build.
- Web typecheck and source-contract suite passed during the refactor.
- Full core verification passes typechecks, web tests, production build/bundle
  budget, server coverage, and the final changed-code audit.
- Desktop verification passes formatting, Clippy, and all 42 Rust tests.
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
migration/self-host upgrade test. No secrets or
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
