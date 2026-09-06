import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url);

describe("standalone Custom Agent migration boundary", () => {
  it("creates immutable revisions, shared conversations, triggers, runs, and exclusive execution contexts", async () => {
    const migration = await readFile(new URL("drizzle/0080_standalone_custom_agents.sql", root), "utf8");
    expect(migration).toContain('CREATE TABLE "ai_agent_revision"');
    expect(migration).toContain('CREATE TABLE "ai_agent_conversation"');
    expect(migration).toContain('CREATE TABLE "ai_agent_trigger"');
    expect(migration).toContain('CREATE TABLE "ai_agent_run"');
    expect(migration).toContain('CREATE TABLE "ai_agent_run_event"');
    expect(migration).toContain('CREATE TABLE "ai_agent_event_receipt"');
    expect(migration).toMatch(/"turn_id" IS NOT NULL\)::int \+ \("agent_run_id" IS NOT NULL\)::int/);
  });

  it("keeps Universal Ask AI personal-only at thread creation", async () => {
    const routes = await readFile(new URL("src/features/ai/conversations/thread-routes.ts", root), "utf8");
    expect(routes).toContain("const createThreadSchema = z.object({");
    expect(routes).toContain("agentProfileId: null");
    const schema = routes.slice(
      routes.indexOf("const createThreadSchema"),
      routes.indexOf("const renameThreadSchema"),
    );
    expect(schema).not.toContain("agentProfileId");
  });

  it("keeps migrated agent chats private and exposes them read-only under the agent", async () => {
    const conversation = await readFile(new URL("src/features/ai/conversations/agent-conversation-service.ts", root), "utf8");
    const routes = await readFile(new URL("src/features/ai/agents/routes.ts", root), "utf8");
    expect(conversation).toContain('eq(aiAgentConversation.visibility, "legacy_private")');
    expect(conversation).toContain("eq(aiAgentConversation.legacyOwnerUserId, input.userId)");
    expect(routes).toContain('/agents/:agentId/legacy-conversations');
  });

  it("uses only agent-principal checks in native run tools", async () => {
    const tools = await readFile(new URL("src/features/ai/execution/agent-native-run-tools.ts", root), "utf8");
    expect(tools).toContain("canAgentAccessPage");
    expect(tools).toContain("canAgentAccessDatabase");
    expect(tools).toContain("canAgentSnapshotAccessPage");
    expect(tools).toContain("canAgentSnapshotAccessDatabase");
    expect(tools).toContain("updateGrantedPage");
    expect(tools).toContain("updateGrantedDatabaseCell");
    expect(tools).toContain("commentOnGrantedPage");
    expect(tools).toContain("createChildPageInGrantedPage");
    expect(tools).toContain("AgentNativeWriteOutcomeUnknownError");
    expect(tools).not.toContain("canAccessPageInWorkspace");
    expect(tools).not.toContain("canAccessDatabaseInWorkspace");
  });

  it("conversation entrypoint checks the shared-user role", async () => {
    const conversation = await readFile(new URL("src/features/ai/conversations/agent-conversation-service.ts", root), "utf8");
    expect(conversation).toContain('requireAgentProfileRole({ ...input, minimum: "user" })');
  });

  it("persists page-style agent covers and icon placement", async () => {
    const migration = await readFile(new URL("drizzle/0081_custom_agent_page_appearance.sql", root), "utf8");
    expect(migration).toContain('ADD COLUMN "cover" text');
    expect(migration).toContain('ADD COLUMN "icon_position" text NOT NULL DEFAULT \'inline\'');
    expect(migration).toContain("CHECK (\"icon_position\" IN ('inline', 'top'))");
  });

  it("bounds each queued run by its captured permissions and current revocations", async () => {
    const runs = await readFile(new URL("src/features/ai/execution/agent-run-service.ts", root), "utf8");
    expect(runs).toContain("readPermissionSnapshot(run.permissionSnapshot)");
    expect(runs).toContain("liveResources.some((resource) => resource.eligibleEditorCount === 0)");
  });

  it("dispatches native events through the deduplicated run boundary", async () => {
    const triggers = await readFile(new URL("src/features/ai/agents/agent-trigger-service.ts", root), "utf8");
    const commits = await readFile(new URL("src/features/databases/core/commit.ts", root), "utf8");
    const collaboration = await readFile(new URL("src/features/collaboration/service.ts", root), "utf8");
    const meetings = await readFile(new URL("src/features/meetings/meeting-summary-service.ts", root), "utf8");
    expect(triggers).toContain("acceptAgentEvent");
    expect(triggers).toContain("dispatchDatabaseAgentMutationFacts");
    expect(triggers).toContain("dispatchPageCommentAgentTriggers");
    expect(triggers).toContain("dispatchMeetingCompletedAgentTriggers");
    expect(triggers).toContain("readOriginatingAgentRun");
    expect(commits).toContain("custom_agent_database_trigger_dispatch_failed");
    expect(collaboration).toContain("dispatchPageCommentAgentTriggers");
    expect(meetings).toContain("dispatchMeetingCompletedAgentTriggers");
  });

  it("keeps provider events adapter-gated and arbitrary MCP servers tool-only", async () => {
    const triggers = await readFile(new URL("src/features/ai/agents/agent-trigger-service.ts", root), "utf8");
    expect(triggers).toContain("connector_event_adapter_required");
    expect(triggers).toContain("Connector triggers require an installed curated event adapter.");
    expect(triggers).toContain("slack_event_adapter_required");
  });

  it("reconciles trigger registrations transactionally with every immutable revision", async () => {
    const revisions = await readFile(new URL("src/features/ai/agents/agent-revision-service.ts", root), "utf8");
    const conversation = await readFile(new URL("src/features/ai/conversations/agent-conversation-service.ts", root), "utf8");
    expect(revisions).toContain("synchronizeMaterializedTriggers");
    expect(revisions).toContain("desiredTriggers");
    expect(revisions).toContain("webhookSecretId");
    expect(revisions).toContain('desired.kind === "connector" || desired.kind === "slack"');
    expect(conversation).toContain("proposeSettings");
    expect(conversation).not.toContain("applyAgentDefinition");
    const settings = await readFile(new URL("src/features/ai/settings/settings-service.ts", root), "utf8");
    expect(settings).toContain("synchronizeMaterializedTriggers");
    expect(settings).toContain("db.transaction");
  });

  it("exposes durable manual runs and scoped approval handling", async () => {
    const routes = await readFile(new URL("src/features/ai/agents/routes.ts", root), "utf8");
    expect(routes).toContain('post("/agents/:agentId/runs"');
    expect(routes).toContain('get("/agents/:agentId/runs/:runId/approvals"');
    expect(routes).toContain('actions/:actionId/approve"');
    expect(routes).toContain('actions/:actionId/reject"');
    expect(routes).toContain("requireRunApprovalActor");
  });

  it("derives the resource editor guard from active human access", async () => {
    const resources = await readFile(new URL("src/features/ai/agents/agent-resource-service.ts", root), "utf8");
    expect(resources).toContain("activeMembershipCondition()");
    expect(resources).toContain("eligible.filter(Boolean).length");
    expect(resources).not.toContain("eligibleEditorCount: 1");
  });
});
