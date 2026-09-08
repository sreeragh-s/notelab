import { isLocalRuntime } from "../../../../infrastructure/runtime/runtime-adapter";
import { getStringEnv, type RuntimeEnv } from "../../../../shared/config/config";

export const MCP_LIMITS = {
  maxCallsPerTurn: 8,
  maxConnectionsPerAgent: 10,
  maxEnabledToolsPerAgent: 100,
  maxHeaders: 5,
  maxModelToolsPerTurn: 40,
  maxResponseBytes: 5 * 1024 * 1024,
  timeoutMs: 30_000,
} as const;

export function isMcpEnabled(env: RuntimeEnv) {
  if (isLocalRuntime()) return false;
  return getStringEnv(env, "AI_MCP_ENABLED")?.trim().toLowerCase() === "true";
}

export function isMcpCustomServersEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AI_MCP_CUSTOM_SERVERS_ENABLED")?.trim().toLowerCase() === "true";
}

export function isMcpExternalWritesEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AI_MCP_EXTERNAL_WRITES_ENABLED")?.trim().toLowerCase() === "true";
}

export function isMcpExecutionEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AI_MCP_EXECUTION_DISABLED")?.trim().toLowerCase() !== "true";
}
