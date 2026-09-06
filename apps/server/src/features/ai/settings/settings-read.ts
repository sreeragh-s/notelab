import { ensureInstructionPage, hydrateInstructionPage } from "./instruction-pages";
import { and, desc, eq } from "drizzle-orm";
import { settingsReviewSchema, settingsDefinitionSchema, type AgentSettingsDefinition, type AgentSettingsState } from "@zilobase/features/ai-chat/settings-contract";

import { db } from "../../../infrastructure/database";
import { aiSettingsDraft, aiSettingsVersion, aiAgentRevision } from "../../../infrastructure/database/schema";

import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import { type SettingsActor, authorizeSettings } from "./settings-access";
import { ensureSettingsBaseline } from "./settings-baseline";
import { sameSettings } from "./settings-definition";

export async function readSettings(
  a: SettingsActor,
): Promise<AgentSettingsState> {
  const role = await authorizeSettings(a);
  const saved = await ensureSettingsBaseline(a);
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

export async function settingsVersions(a: SettingsActor) {
  await authorizeSettings(a);
  const settings = await ensureSettingsBaseline(a);
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
