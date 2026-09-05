type ReturnScope =
  | { type: "personal" }
  | { type: "agent"; agentProfileId: string };

export function mcpOAuthReturnUrl(
  origin: string,
  scope: ReturnScope | null,
  outcome: "connected" | "failed",
) {
  const agentId = scope?.type === "agent" ? scope.agentProfileId : null;
  const target = new URL(
    agentId ? `/agents/${encodeURIComponent(agentId)}` : "/ai",
    origin,
  );
  target.searchParams.set("panel", "settings");
  target.searchParams.set("settingsTab", agentId ? "tools" : "connectors");
  if (!agentId) target.searchParams.set("settingsScope", "personal");
  target.searchParams.set("mcp", outcome);
  return target.toString();
}
