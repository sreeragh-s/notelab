/** Deployment capabilities are independent of editions and user permissions. */
export type RuntimeMode = "remote" | "local";
export type RuntimeCapability = "members" | "sharing" | "publishing" | "integrations" | "local-ai" | "local-transcription";
export const FEATURE_UNAVAILABLE_LOCAL = "FEATURE_UNAVAILABLE_LOCAL";
export type LocalRuntimePhase = "stopped" | "starting" | "migrating" | "ready" | "maintenance" | "stopping" | "error";
export type LocalRuntimeStatus = { phase: LocalRuntimePhase; code?: string };
export function runtimeHasCapability(mode: RuntimeMode, capability: RuntimeCapability): boolean {
  return capability === "local-ai" || capability === "local-transcription"
    ? mode === "local" : mode === "remote";
}
