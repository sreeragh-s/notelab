import { encodePageContentAsYjs, replacePageContent } from "../../collaboration/service";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  allInstructionResources,
  ensureInstructionPage,
  hydrateInstructionPage,
} from "./instruction-pages";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  emptySettingsDefinition,
  settingsReviewSchema,
  mergeSettingsReview,
  settingsDefinitionSchema,
  type AgentSettingsDefinition,
  type AgentSettingsState,
} from "@zilobase/features/ai-chat/settings-contract";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { db } from "../../../infrastructure/database";
import {
  aiSettings,
  aiSettingsDraft,
  aiSettingsVersion,
  aiAgentProfile,
  aiAgentRevision,
  aiAgentTrigger,
  aiAgentProfileAccess,
  aiAgentUserPreference,
  aiMcpConnection,
  aiMcpToolSnapshot,
  meeting,
  page,
  pageAccess,
  pageCollaborationDocument,
  databaseAccess,
} from "../../../infrastructure/database/schema";
import {
  canAccessPageInWorkspace,
  canAccessDatabaseInWorkspace,
  getMembership,
} from "../../access";
import {
  AgentProfileError,
  requireAgentProfileRole,
  validateAccessPrincipals,
} from "../agents/agent-profile-service";
import { listAgentResources } from "../agents/agent-resource-service";
import { synchronizeMaterializedTriggers } from "../agents/agent-revision-service";
import { hashAgentDefinition } from "../agents/agent-definition";
import { markdownToPageContent } from "../conversion/markdown-to-page-content";

export type SettingsActor = {
  scope: string;
  userId: string;
  workspaceId: string;
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const settingsScopeKey = (a: SettingsActor) =>
  a.scope === "personal" ? `personal:${a.userId}` : `agent:${a.scope}`;
const conflict = () =>
  new AgentProfileError(
    "settings_conflict",
    "Settings changed elsewhere. Reload the saved version before publishing your draft.",
    409,
  );
export async function authorizeSettings(a: SettingsActor, edit = false) {
  if (!(await getMembership(a.workspaceId, a.userId)))
    throw new AgentProfileError("forbidden", "Workspace access required.", 403);
  if (a.scope !== "personal")
    return requireAgentProfileRole({
      ...a,
      profileId: a.scope,
      minimum: edit ? "editor" : "user",
    });
  return "owner" as const;
}
function connectionWhere(a: SettingsActor) {
  return and(
    eq(aiMcpConnection.workspaceId, a.workspaceId),
    a.scope === "personal"
      ? and(
          eq(aiMcpConnection.scopeType, "personal"),
          eq(aiMcpConnection.scopeUserId, a.userId),
        )
      : and(
          eq(aiMcpConnection.scopeType, "agent"),
          eq(aiMcpConnection.agentProfileId, a.scope),
        ),
  );
}
async function baseline(
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
    .where(connectionWhere(a));
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
async function ensureSettings(a: SettingsActor) {
  const where = and(
    eq(aiSettings.workspaceId, a.workspaceId),
    eq(aiSettings.scope, settingsScopeKey(a)),
  );
  const [existing] = await db.select().from(aiSettings).where(where);
  if (existing) return existing;
  const initial = await baseline(a);
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
export async function readSettings(
  a: SettingsActor,
): Promise<AgentSettingsState> {
  const role = await authorizeSettings(a);
  const saved = await ensureSettings(a);
  const [draft] = await db
    .select()
    .from(aiSettingsDraft)
    .where(
      and(
        eq(aiSettingsDraft.settingsId, saved.id),
        eq(aiSettingsDraft.userId, a.userId),
      ),
    );
  let savedDefinition = settingsDefinitionSchema.parse(saved.definition);
  // Migration establishes the existing source link, not an unsaved user change.
  if (role !== "user") {
    const pageId = await ensureInstructionPage(a, saved.id, savedDefinition);
    if (pageId) savedDefinition = { ...savedDefinition, instructionPageId: pageId };
  }
  let definition = settingsDefinitionSchema.parse(draft?.definition ?? savedDefinition);
  if (role !== "user") {
    const instructionPageId = definition.instructionPageId ?? savedDefinition.instructionPageId ??
      await ensureInstructionPage(a, saved.id, definition);
    if (instructionPageId) definition = { ...definition, instructionPageId };
    definition = await hydrateInstructionPage(a, definition);
  }
  let review = draft?.review ? settingsReviewSchema.parse(draft.review) : null;
  if (review && (review.fields.includes("instructions") || review.fields.includes("instructionDocument")) &&
      !sameSettings(review.before.instructionResources ?? [], definition.instructionResources ?? [])) {
    review = { ...review, after: { ...review.after, instructionResources: definition.instructionResources },
      fields: [...new Set([...review.fields, "instructionResources" as const])] };
  }
  return {
    definition,
    saved: savedDefinition,
    baseVersion: draft?.baseVersion ?? saved.version,
    version: saved.version,
    draftVersion: draft?.draftVersion ?? 0,
    pendingRun: draft?.pendingRun ?? null,
    canEdit: role !== "user",
    review,
  };
}
export function mergeSettingsPatch(
  current: AgentSettingsDefinition,
  patch: Partial<AgentSettingsDefinition>,
) {
  const next = settingsDefinitionSchema.parse({ ...current, ...patch });
  if (patch.instructionDocument)
    next.instructions = prosemirrorToMarkdown(patch.instructionDocument);
  else if (patch.instructions !== undefined)
    next.instructionDocument = markdownToPageContent(patch.instructions);
  return settingsDefinitionSchema.parse(next);
}
export function createSettingsInstruction(
  a: SettingsActor,
  input: { baseVersion: number; draftVersion: number },
) {
  return updateSettingsDraft(a, { ...input, patch: {} }, undefined, true);
}
export async function updateSettingsDraft(
  a: SettingsActor,
  input: {
    patch: Partial<AgentSettingsDefinition>;
    baseVersion: number;
    draftVersion: number;
    pendingRun?: string | null;
    origin?: "ai";
  },
  env?: RuntimeEnv,
  createInstruction = false,
) {
  await authorizeSettings(a, true);
  const settings = await ensureSettings(a);
  const proposalBase = input.origin === "ai" ? await readSettings(a) : null;
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.id, settings.id))
      .for("update");
    const [draft] = await tx
      .select()
      .from(aiSettingsDraft)
      .where(
        and(
          eq(aiSettingsDraft.settingsId, settings.id),
          eq(aiSettingsDraft.userId, a.userId),
        ),
      );
    if (
      input.draftVersion !== (draft?.draftVersion ?? 0) ||
      input.baseVersion !== (draft?.baseVersion ?? saved!.version)
    )
      throw conflict();
    if (createInstruction) {
      if (input.baseVersion !== saved!.version) throw conflict();
      const pageId = crypto.randomUUID();
      const content = markdownToPageContent("");
      await tx.insert(page).values({
        id: pageId, workspaceId: a.workspaceId, createdById: a.userId,
        type: "pageblock", name: "", content,
        metadata: { zilobaseai: "instruction" },
      });
      await tx.insert(pageCollaborationDocument).values({
        pageId, state: Buffer.from(encodePageContentAsYjs(content)), updatedAt: new Date(),
      });
      input = { ...input, patch: {
        instructionPageId: pageId, instructionTitle: "", instructionDocument: content,
        instructions: "", instructionResources: [],
      } };
    }
    let definition = mergeSettingsPatch(
      (proposalBase?.definition ?? draft?.definition ?? saved!.definition) as AgentSettingsDefinition,
      input.patch,
    );
    if (
      a.scope === "personal" &&
      (definition.triggers.length ||
        definition.resources.length ||
        definition.grants.length)
    )
      throw new AgentProfileError(
        "invalid_personal_settings",
        "Triggers and access are custom-agent settings.",
      );
    if (proposalBase && !definition.instructionPageId &&
      (input.patch.instructions !== undefined || input.patch.instructionDocument || input.patch.instructionTitle !== undefined)) {
      const pageId = crypto.randomUUID();
      await tx.insert(page).values({
        id: pageId, workspaceId: a.workspaceId, createdById: a.userId, type: "pageblock",
        name: definition.instructionTitle === "Instructions" ? "" : definition.instructionTitle ?? "",
        content: definition.instructionDocument, metadata: { zilobaseai: "instruction" },
      });
      await tx.insert(pageCollaborationDocument).values({
        pageId, state: Buffer.from(encodePageContentAsYjs(definition.instructionDocument)), updatedAt: new Date(),
      });
      definition = { ...definition, instructionPageId: pageId };
    }
    const previousReview = draft?.review ? settingsReviewSchema.parse(draft.review) : null;
    const fields = Object.keys(input.patch) as (keyof AgentSettingsDefinition)[];
    if (fields.includes("instructions")) fields.push("instructionDocument");
    if (proposalBase && definition.instructionPageId !== proposalBase.definition.instructionPageId) fields.push("instructionPageId");
    const review = proposalBase
      ? mergeSettingsReview(previousReview, proposalBase.definition, definition, fields)
      : previousReview;
    const values = {
      definition,
      review,
      baseVersion: input.baseVersion,
      draftVersion: input.draftVersion + 1,
      pendingRun:
        input.pendingRun === undefined
          ? (draft?.pendingRun ?? null)
          : input.pendingRun,
      updatedAt: new Date(),
    };
    await tx
      .insert(aiSettingsDraft)
      .values({
        id: crypto.randomUUID(),
        settingsId: settings.id,
        userId: a.userId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [aiSettingsDraft.settingsId, aiSettingsDraft.userId],
        set: values,
      });
  });
  if (!createInstruction && (
    input.patch.instructionDocument ||
    input.patch.instructions !== undefined ||
    input.patch.instructionTitle !== undefined
  )) {
    const snapshot = await readSettings(a);
    const pageId = snapshot.definition.instructionPageId;
    if (pageId) {
      if (
        !(await canAccessPageInWorkspace(
          pageId,
          a.workspaceId,
          a.userId,
          "edit",
        ))
      )
        throw new AgentProfileError(
          "instruction_page_forbidden",
          "You cannot edit this instruction page.",
          403,
        );
      if (
        input.patch.instructionDocument ||
        input.patch.instructions !== undefined
      )
        await replacePageContent({
          pageId,
          userId: a.userId,
          env: env ?? {},
          content:
            input.patch.instructionDocument ??
            markdownToPageContent(input.patch.instructions!),
        });
      if (input.patch.instructionTitle !== undefined)
        await db
          .update(page)
          .set({ name: input.patch.instructionTitle, updatedAt: new Date() })
          .where(eq(page.id, pageId));
    }
  }
  return readSettings(a);
}
export async function discardSettingsDraft(
  a: SettingsActor,
  draftVersion: number,
  env?: RuntimeEnv,
) {
  await authorizeSettings(a, true);
  const settings = await ensureSettings(a);
  const current = await readSettings(a);
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.id, settings.id))
      .for("update");
    const [draft] = await tx
      .select()
      .from(aiSettingsDraft)
      .where(
        and(
          eq(aiSettingsDraft.settingsId, settings.id),
          eq(aiSettingsDraft.userId, a.userId),
        ),
      );
    if ((draft?.draftVersion ?? 0) !== draftVersion) throw conflict();
    const review = draft?.review ? settingsReviewSchema.parse(draft.review) : null;
    const pageId = current.definition.instructionPageId;
    if (review && pageId && review.before.instructionPageId === pageId) {
      const contentChanged = review.fields.includes("instructions") || review.fields.includes("instructionDocument");
      const titleChanged = review.fields.includes("instructionTitle");
      if ((contentChanged && current.definition.instructions !== prosemirrorToMarkdown(review.after.instructionDocument)) ||
          (titleChanged && current.definition.instructionTitle !== review.after.instructionTitle)) {
        throw new AgentProfileError("instruction_review_conflict", "The instruction page has newer edits. Review them before discarding the AI changes.", 409);
      }
      if ((contentChanged || titleChanged) && !(await canAccessPageInWorkspace(pageId, a.workspaceId, a.userId, "edit")))
        throw new AgentProfileError("instruction_page_forbidden", "You cannot edit this instruction page.", 403);
      if (contentChanged) await replacePageContent({ pageId, userId: a.userId, env: env ?? {}, content: review.before.instructionDocument });
      if (titleChanged) await tx.update(page).set({ name: review.before.instructionTitle ?? "", updatedAt: new Date() }).where(eq(page.id, pageId));
    }

    await tx
      .delete(aiSettingsDraft)
      .where(
        and(
          eq(aiSettingsDraft.settingsId, settings.id),
          eq(aiSettingsDraft.userId, a.userId),
        ),
      );
  });
  return readSettings(a);
}
export async function settingsVersions(a: SettingsActor) {
  await authorizeSettings(a);
  const settings = await ensureSettings(a);
  const versions = await db
    .select({
      id: aiSettingsVersion.id,
      version: aiSettingsVersion.version,
      definition: aiSettingsVersion.definition,
      createdAt: aiSettingsVersion.createdAt,
    })
    .from(aiSettingsVersion)
    .where(eq(aiSettingsVersion.settingsId, settings.id))
    .orderBy(desc(aiSettingsVersion.version));
  if (a.scope === "personal") return versions.map(v => ({ ...v, definition: settingsDefinitionSchema.parse(v.definition) }));
  const legacy = await db
    .select()
    .from(aiAgentRevision)
    .where(eq(aiAgentRevision.profileId, a.scope))
    .orderBy(desc(aiAgentRevision.version));
  const known = new Set(versions.map((v) => v.version));
  return [
    ...versions,
    ...legacy
      .filter((v) => !known.has(v.version))
      .map((v) => {
        const recorded = v.definition as Record<string, unknown>;
        return {
          id: v.id,
          version: v.version,
          createdAt: v.createdAt,
          legacy: true,
          definition: {
            ...(settings.definition as AgentSettingsDefinition),
            ...recorded,
            instructionDocument: markdownToPageContent(
              String(recorded.instructions ?? ""),
            ),
          },
        };
      }),
  ].map(v => ({ ...v, definition: settingsDefinitionSchema.parse(v.definition) })).sort((a, b) => b.version - a.version);
}
async function validateDefinition(
  a: SettingsActor,
  d: AgentSettingsDefinition,
) {
  if (a.scope !== "personal") {
    await validateAccessPrincipals(a.workspaceId, d.grants);
    for (const r of allInstructionResources(d)) {
      const required = r.accessLevel === "view" ? "view" : "full";
      const allowed =
        r.resourceType === "page"
          ? await canAccessPageInWorkspace(
              r.resourceId,
              a.workspaceId,
              a.userId,
              required,
            )
          : await canAccessDatabaseInWorkspace(
              r.resourceId,
              a.workspaceId,
              a.userId,
              required,
            );
      if (!allowed)
        throw new AgentProfileError(
          "agent_resource_grant_forbidden",
          "You lack permission to grant this resource.",
          403,
        );
    }
    for (const t of d.triggers) {
      if (t.kind === "webhook" && t.status === "active") {
        const [existing] = await db
          .select()
          .from(aiAgentTrigger)
          .where(
            and(
              eq(aiAgentTrigger.id, t.id),
              eq(aiAgentTrigger.profileId, a.scope),
            ),
          );
        if (!existing?.webhookSecretId)
          throw new AgentProfileError(
            "webhook_secret_required",
            "Save the webhook paused, create its secret, then enable it and Save.",
          );
      }
      if (
        t.kind === "schedule" &&
        t.config.cadence === "custom" &&
        (typeof t.config.intervalMinutes !== "number" ||
          !Number.isFinite(t.config.intervalMinutes) ||
          t.config.intervalMinutes < 5 ||
          t.config.intervalMinutes > 525600)
      )
        throw new AgentProfileError(
          "invalid_schedule",
          "Custom schedules require an interval of at least five minutes.",
        );
      if (
        t.kind === "schedule" &&
        !["daily", "weekly", "monthly", "yearly", "custom"].includes(
          String(t.config.cadence),
        )
      )
        throw new AgentProfileError(
          "invalid_schedule",
          "Choose a supported schedule cadence.",
        );
      if (["connector", "slack"].includes(t.kind) && t.status === "active")
        throw new AgentProfileError(
          "trigger_adapter_required",
          "This trigger requires a supported event adapter.",
          409,
        );
      if (
        t.kind === "database" &&
        !["row_added", "row_removed", "property_changed"].includes(
          String(t.config.event),
        )
      )
        throw new AgentProfileError(
          "invalid_database_event",
          "Choose a supported database event.",
        );
      if (t.kind === "meeting") {
        const [record] = await db
          .select({ pageId: meeting.pageId })
          .from(meeting)
          .where(
            and(
              eq(meeting.id, String(t.config.meetingId ?? "")),
              eq(meeting.workspaceId, a.workspaceId),
            ),
          );
        if (
          !record ||
          !allInstructionResources(d).some(
            (r) => r.resourceType === "page" && r.resourceId === record.pageId,
          )
        )
          throw new AgentProfileError(
            "meeting_access_required",
            "Grant the meeting page in Access before saving.",
            409,
          );
      }
      const target =
        t.kind === "database"
          ? t.config.databaseId
          : ["comment", "mention"].includes(t.kind)
            ? t.config.pageId
            : null;
      if (
        ["database", "comment", "mention"].includes(t.kind) &&
        (!target ||
          !allInstructionResources(d).some(
            (r) =>
              r.resourceId === target &&
              r.resourceType === (t.kind === "database" ? "database" : "page"),
          ))
      )
        throw new AgentProfileError(
          "trigger_access_required",
          "Grant the trigger's resource in Access before saving.",
        );
    }
  }
  const connections = await db
    .select()
    .from(aiMcpConnection)
    .where(connectionWhere(a));
  let enabled = 0;
  for (const c of d.connectors) {
    const connection = connections.find((x) => x.id === c.connectionId);
    if (!connection)
      throw new AgentProfileError(
        "connector_unavailable",
        "A connector is no longer available in this scope.",
        409,
      );
    if (
      c.alwaysAllowEnabled !== connection.alwaysAllowEnabled &&
      connection.authenticatedByUserId !== a.userId
    )
      throw new AgentProfileError(
        "connector_authenticator_required",
        "Only the member who connected this account can change always-allow.",
        403,
      );
    const tools = await db
      .select()
      .from(aiMcpToolSnapshot)
      .where(eq(aiMcpToolSnapshot.connectionId, c.connectionId));
    for (const t of c.tools) {
      if (!tools.some((x) => x.id === t.toolId && (!t.enabled || x.available)))
        throw new AgentProfileError(
          "connector_tool_unavailable",
          "A selected connector tool is unavailable. Refresh its permissions.",
          409,
        );
      if (t.enabled) enabled++;
    }
  }
  if (enabled > 100)
    throw new AgentProfileError(
      "connector_tool_limit",
      "At most 100 connector tools may be enabled.",
      409,
    );
  for (const list of [
    d.triggers.map((x) => x.id),
    d.resources.map((x) => `${x.resourceType}:${x.resourceId}`),
    d.grants.map((x) => `${x.principalType}:${x.principalId}`),
    d.connectors.map((x) => x.connectionId),
    ...d.connectors.map((x) => x.tools.map((t) => t.toolId)),
  ])
    if (new Set(list).size !== list.length)
      throw new AgentProfileError(
        "duplicate_settings",
        "Duplicate settings entries are not allowed.",
      );
}
export async function publishSettings(
  a: SettingsActor,
  input: { baseVersion: number; draftVersion: number },
) {
  await authorizeSettings(a, true);
  const settings = await ensureSettings(a);
  const initialDefinition = settingsDefinitionSchema.parse(settings.definition);
  const instructionPageId = await ensureInstructionPage(
    a,
    settings.id,
    initialDefinition,
  );
  let pendingRun: string | null = null;
  await db.transaction(async (tx) => {
    const [saved] = await tx
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.id, settings.id))
      .for("update");
    const [draft] = await tx
      .select()
      .from(aiSettingsDraft)
      .where(
        and(
          eq(aiSettingsDraft.settingsId, settings.id),
          eq(aiSettingsDraft.userId, a.userId),
        ),
      );
    if (!draft && input.baseVersion !== saved!.version) return;
    if (
      (draft?.baseVersion ?? saved!.version) !== saved!.version ||
      input.baseVersion !== saved!.version ||
      (draft?.draftVersion ?? 0) !== input.draftVersion
    )
      throw conflict();
    let d = settingsDefinitionSchema.parse(
      draft?.definition ?? saved!.definition,
    );
    // The link is stable before publication; source pages retain their own normal autosave.
    if (!d.instructionPageId && instructionPageId) d = { ...d, instructionPageId };
    d = await hydrateInstructionPage(a, d);
    await validateDefinition(a, d);
    const changed = !sameSettings(
      settingsDefinitionSchema.parse(saved!.definition),
      d,
    );
    pendingRun = draft?.pendingRun ?? null;
    if (changed) {
      const version = saved!.version + 1;
      await materialize(tx, a, d, saved!.version, version);
      await tx
        .update(aiSettings)
        .set({ definition: d, version, updatedAt: new Date() })
        .where(eq(aiSettings.id, settings.id));
      await tx.insert(aiSettingsVersion).values({
        id: crypto.randomUUID(),
        settingsId: settings.id,
        version,
        definition: d,
        createdByUserId: a.userId,
      });
    }
    if (draft)
      await tx.delete(aiSettingsDraft).where(eq(aiSettingsDraft.id, draft.id));
  });
  return { ...(await readSettings(a)), pendingRun };
}
async function materialize(
  tx: Tx,
  a: SettingsActor,
  d: AgentSettingsDefinition,
  baseVersion: number,
  version: number,
) {
  const now = new Date();
  if (a.scope !== "personal") {
    const [profile] = await tx
      .select()
      .from(aiAgentProfile)
      .where(eq(aiAgentProfile.id, a.scope))
      .for("update");
    if (profile?.version !== baseVersion) throw conflict();
    const revisionId = crypto.randomUUID();
    const [previousRevision] = profile.currentRevisionId
      ? await tx
          .select()
          .from(aiAgentRevision)
          .where(eq(aiAgentRevision.id, profile.currentRevisionId))
      : [];
    const definition = {
      ...d,
      defaultModel: "auto",
      safeExecutionPreferences:
        (
          previousRevision?.definition as
            | { safeExecutionPreferences?: Record<string, unknown> }
            | undefined
        )?.safeExecutionPreferences ?? {},
    };
    await tx.insert(aiAgentRevision).values({
      id: revisionId,
      profileId: a.scope,
      version,
      definition,
      compiledDefinition: {
        ...definition,
        systemInstructions: d.instructions,
      },
      definitionHash: hashAgentDefinition(definition),
      createdByUserId: a.userId,
    });
    await tx
      .update(aiAgentProfile)
      .set({
        name: d.name,
        description: d.description,
        icon: d.icon,
        cover: d.cover,
        iconPosition: d.iconPosition,
        instructions: d.instructions,
        defaultModel: "auto",
        version,
        currentRevisionId: revisionId,
        updatedAt: now,
      })
      .where(eq(aiAgentProfile.id, a.scope));
    await synchronizeMaterializedTriggers(
      tx,
      a.scope,
      revisionId,
      d.triggers,
      now,
    );
    await tx
      .delete(aiAgentProfileAccess)
      .where(eq(aiAgentProfileAccess.profileId, a.scope));
    if (d.grants.length)
      await tx.insert(aiAgentProfileAccess).values(
        d.grants.map((g) => ({
          ...g,
          id: crypto.randomUUID(),
          profileId: a.scope,
          createdByUserId: a.userId,
        })),
      );
    await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, a.workspaceId),
          eq(pageAccess.targetType, "agent"),
          eq(pageAccess.targetId, a.scope),
        ),
      );
    await tx
      .delete(databaseAccess)
      .where(
        and(
          eq(databaseAccess.workspaceId, a.workspaceId),
          eq(databaseAccess.targetType, "agent"),
          eq(databaseAccess.targetId, a.scope),
        ),
      );
    for (const r of allInstructionResources(d)) {
      const common = {
        id: crypto.randomUUID(),
        targetType: "agent",
        targetId: a.scope,
        accessLevel: r.accessLevel,
        workspaceId: a.workspaceId,
      };
      if (r.resourceType === "page")
        await tx.insert(pageAccess).values({ ...common, pageId: r.resourceId });
      else
        await tx
          .insert(databaseAccess)
          .values({ ...common, databaseId: r.resourceId });
    }
  }
  const connections = await tx
    .select()
    .from(aiMcpConnection)
    .where(connectionWhere(a))
    .for("update");
  if (connections.length)
    await tx
      .update(aiMcpToolSnapshot)
      .set({ enabled: false, updatedAt: now })
      .where(
        inArray(
          aiMcpToolSnapshot.connectionId,
          connections.map((c) => c.id),
        ),
      );
  for (const c of d.connectors) {
    await tx
      .update(aiMcpConnection)
      .set({ alwaysAllowEnabled: c.alwaysAllowEnabled, updatedAt: now })
      .where(and(eq(aiMcpConnection.id, c.connectionId), connectionWhere(a)));
    for (const t of c.tools)
      await tx
        .update(aiMcpToolSnapshot)
        .set({
          enabled: t.enabled,
          classification: t.classification,
          executionMode: t.executionMode,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiMcpToolSnapshot.id, t.toolId),
            eq(aiMcpToolSnapshot.connectionId, c.connectionId),
          ),
        );
  }
}

export function sameSettings(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string =>
    Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value && typeof value === "object"
        ? `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(",")}}`
        : (JSON.stringify(value) ?? "null");
  return canonical(a) === canonical(b);
}
