import { createHash } from "node:crypto";

import type { CustomAgentDefinition } from "@zilobase/features/ai-chat/custom-agent-contract";

import { aiAgentProfile } from "../../../infrastructure/database/schema";

export function definitionForProfile(
  profile: Pick<typeof aiAgentProfile.$inferSelect,
    "defaultModel" | "description" | "icon" | "instructions" | "name">,
): CustomAgentDefinition {
  return {
    defaultModel: profile.defaultModel,
    description: profile.description,
    icon: profile.icon ?? null,
    instructions: profile.instructions,
    name: profile.name,
    safeExecutionPreferences: {},
    triggers: [],
  };
}

export function hashAgentDefinition(definition: CustomAgentDefinition) {
  return createHash("sha256").update(stableJson(definition)).digest("hex");
}

export function normalizeAgentDefinition(value: unknown): CustomAgentDefinition {
  const input = (value && typeof value === "object" ? value : {}) as Partial<CustomAgentDefinition>;
  return {
    defaultModel: typeof input.defaultModel === "string" && input.defaultModel ? input.defaultModel : "auto",
    description: typeof input.description === "string" ? input.description.slice(0, 500) : "",
    icon: input.icon ?? null,
    instructions: typeof input.instructions === "string" ? input.instructions.slice(0, 20_000) : "",
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 120) : "Untitled agent",
    safeExecutionPreferences: input.safeExecutionPreferences && typeof input.safeExecutionPreferences === "object"
      ? input.safeExecutionPreferences
      : {},
    triggers: Array.isArray(input.triggers) ? input.triggers : [],
  };
}

export function compileAgentDefinition(definition: CustomAgentDefinition) {
  return { ...definition, systemInstructions: definition.instructions.trim() };
}

export function computeNextAgentSchedule(config: Record<string, unknown>, from: Date) {
  const cadence = typeof config.cadence === "string" ? config.cadence : "daily";
  const next = new Date(from);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cadence === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else if (cadence === "custom" && typeof config.intervalMinutes === "number" && Number.isFinite(config.intervalMinutes)) {
    next.setUTCMinutes(next.getUTCMinutes() + Math.max(5, Math.min(config.intervalMinutes, 525_600)));
  } else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
