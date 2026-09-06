import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { emptySettingsDefinition, settingsDefinitionSchema, type AgentSettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { db } from "../../../infrastructure/database";
import { aiSettings, aiSettingsVersion, aiAgentProfile, aiAgentTrigger, aiAgentProfileAccess, aiAgentUserPreference, aiMcpConnection, aiMcpToolSnapshot, page } from "../../../infrastructure/database/schema";
import { canAccessPageInWorkspace } from "../../access";
import { AgentProfileError } from "../agents/agent-profile-service";
import { listAgentResources } from "../agents/agent-resource-service";

import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import { type SettingsActor, settingsConnectionCondition, settingsScopeKey } from "./settings-access";

async function loadInitialSettings(
  a: SettingsActor,
): Promise<{ definition: AgentSettingsDefinition; version: number }> {
  const definition = emptySettingsDefinition();
  let version = 1;
  if (a.scope === "personal") {
    const [preference] = await db
      .select()
      .from(aiAgentUserPreference)
      .where(
        and(
          eq(aiAgentUserPreference.workspaceId, a.workspaceId),
          eq(aiAgentUserPreference.userId, a.userId),
        ),
      );
    const pages = await db
      .select()
      .from(page)
      .where(
        and(
          eq(page.workspaceId, a.workspaceId),
          isNull(page.deletedAt),
          sql`${page.metadata}->>'zilobaseai' = 'instruction'`,
        ),
      )
      .orderBy(desc(page.updatedAt));
    const content: unknown[] = [];
    if (preference?.instructions)
      content.push(...markdownToPageContent(preference.instructions).content);
    for (const p of pages) {
      if (
        !(await canAccessPageInWorkspace(p.id, a.workspaceId, a.userId, "view"))
      )
        continue;
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: p.name || "Untitled instruction" }],
      });
      const doc = p.content as { content?: unknown[] } | null;
      content.push(...(doc?.content ?? []));
    }
    definition.instructionDocument = { type: "doc", content };
    definition.instructions = prosemirrorToMarkdown(
      definition.instructionDocument,
    );
  } else {
    const [profile] = await db
      .select()
      .from(aiAgentProfile)
      .where(eq(aiAgentProfile.id, a.scope));
    if (!profile)
      throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
    Object.assign(definition, {
      name: profile.name,
      description: profile.description,
      icon: profile.icon,
      cover: profile.cover,
      iconPosition: profile.iconPosition,
      instructions: profile.instructions,
      instructionDocument: markdownToPageContent(profile.instructions),
    });
    version = profile.version;
    definition.triggers = (
      await db
        .select()
        .from(aiAgentTrigger)
        .where(eq(aiAgentTrigger.profileId, a.scope))
    ).map(({ id, kind, label, config, status }) => ({
      id,
      kind,
      label,
      config,
      status,
    })) as AgentSettingsDefinition["triggers"];
    definition.resources = (
      await listAgentResources({ ...a, profileId: a.scope })
    ).map(({ resourceType, resourceId, accessLevel }) => ({
      resourceType,
      resourceId,
      accessLevel,
    }));
    definition.grants = (
      await db
        .select()
        .from(aiAgentProfileAccess)
        .where(eq(aiAgentProfileAccess.profileId, a.scope))
    ).map(({ principalType, principalId, role }) => ({
      principalType,
      principalId,
      role,
    })) as AgentSettingsDefinition["grants"];
  }
  const connections = await db
    .select()
    .from(aiMcpConnection)
    .where(settingsConnectionCondition(a));
  for (const connection of connections) {
    const tools = await db
      .select()
      .from(aiMcpToolSnapshot)
      .where(eq(aiMcpToolSnapshot.connectionId, connection.id));
    definition.connectors.push({
      connectionId: connection.id,
      alwaysAllowEnabled: connection.alwaysAllowEnabled,
      tools: tools.map(({ id, enabled, classification, executionMode }) => ({
        toolId: id,
        enabled,
        classification,
        executionMode,
      })) as AgentSettingsDefinition["connectors"][number]["tools"],
    });
  }
  return { definition: settingsDefinitionSchema.parse(definition), version };
}

export async function ensureSettingsBaseline(a: SettingsActor) {
  const where = and(
    eq(aiSettings.workspaceId, a.workspaceId),
    eq(aiSettings.scope, settingsScopeKey(a)),
  );
  const [existing] = await db.select().from(aiSettings).where(where);
  if (existing) return existing;
  const initial = await loadInitialSettings(a);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(aiSettings)
      .values({
        id: crypto.randomUUID(),
        workspaceId: a.workspaceId,
        scope: settingsScopeKey(a),
        ...initial,
      })
      .onConflictDoNothing()
      .returning();
    if (created)
      await tx.insert(aiSettingsVersion).values({
        id: crypto.randomUUID(),
        settingsId: created.id,
        ...initial,
        createdByUserId: a.userId,
      });
  });
  return (await db.select().from(aiSettings).where(where))[0]!;
}
