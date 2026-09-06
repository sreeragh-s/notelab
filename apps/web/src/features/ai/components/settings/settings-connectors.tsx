import { McpConnectionsPanel } from "./mcp-connections";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "@zilobase/features";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import {
  useAiAgentProfile,
  useMcpCatalog,
  useMcpConnections,
  useApprovedMcpServers,
  mcpScopeApiPath,
  type AgentSettingsDefinition,
  type McpConnectionScopeRef,
} from "@zilobase/features/ai-chat";
import {
  mailApiBasePath,
  mailConnectionQueryOptions,
} from "@zilobase/features/mail";
import { Button } from "@/shared/ui/button";
import { flushSettingsDrafts } from "../../settings/use-settings-draft";
import { toast } from "sonner";

export function ConnectorSetupCard({
  provider,
  scope = "personal",
}: {
  provider: string;
  scope?: string;
}) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const catalog = useMcpCatalog();
  const approved = useApprovedMcpServers();
  const ref: McpConnectionScopeRef =
    scope === "personal"
      ? { type: "personal" }
      : { type: "agent", agentProfileId: scope };
  const agent = useAiAgentProfile(scope === "personal" ? null : scope);
  const mayConnect =
    scope === "personal" ||
    agent.data?.role === "owner" ||
    agent.data?.role === "editor";
  const connections = useMcpConnections(ref);
  const gmail = useQuery({
    ...mailConnectionQueryOptions(apiFetch, workspaceId),
    enabled: provider === "gmail" && !!workspaceId,
  });
  const [connecting, setConnecting] = React.useState(false);
  const approvedId = provider.startsWith("approved:")
    ? provider.slice(9)
    : null;
  const entry = approvedId
    ? approved.data?.find((x) => x.id === approvedId) && {
        ...approved.data.find((x) => x.id === approvedId)!,
        available: true,
        availabilityReason: null,
      }
    : catalog.data?.find((x) => x.id === provider);
  const existing = connections.data?.find((c) =>
    approvedId
      ? c.endpointUrl ===
        approved.data?.find((x) => x.id === approvedId)?.endpointUrl
      : c.catalogId === provider,
  );
  const connected =
    provider === "gmail"
      ? gmail.data?.status === "connected"
      : existing?.state === "connected";
  const unavailable =
    provider === "gmail"
      ? scope !== "personal" || gmail.data?.providerConfigured === false
      : !entry?.available;
  const label = provider === "gmail" ? "Gmail" : (entry?.label ?? provider);
  const connect = async () => {
    if (!workspaceId) return;
    setConnecting(true);
    try {
      await flushSettingsDrafts();
      const headers = { "x-zilobase-workspace-id": workspaceId };
      const returnTo =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      let authorizationUrl: string;
      if (provider === "gmail") {
        const result = await apiFetch<{ authorizationUrl: string }>(
          `${mailApiBasePath(workspaceId)}/oauth/start`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ client: "web", returnTo }),
          },
        );
        authorizationUrl = result.authorizationUrl;
      } else {
        const base = mcpScopeApiPath(ref);
        const connection =
          existing ??
          (
            await apiFetch<{ connection: { id: string } }>(
              `${base}/connections`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  authMethod: "oauth",
                  ...(approvedId
                    ? { approvedServerId: approvedId }
                    : { catalogId: provider }),
                }),
              },
            )
          ).connection;
        const result = await apiFetch<{ authorizationUrl: string }>(
          `${base}/connections/${encodeURIComponent(connection.id)}/oauth/start`,
          { method: "POST", headers, body: JSON.stringify({ returnTo }) },
        );
        authorizationUrl = result.authorizationUrl;
      }
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not connect account.",
      );
      setConnecting(false);
    }
  };
  React.useEffect(() => {
    const focus = () => {
      void connections.refetch();
      if (provider === "gmail") void gmail.refetch();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [scope, provider]);
  return (
    <div
      className="not-prose my-2 flex items-center gap-4 rounded-lg border border-control-border bg-surface-canvas p-4"
      data-connector-setup={provider}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-content-secondary">
          {connected
            ? "Connected"
            : unavailable
              ? provider === "gmail" && scope !== "personal"
                ? "Gmail is currently available to personal Ask AI. Delegated Gmail access is not supported."
                : (entry?.availabilityReason ??
                  "Connection unavailable on this server.")
              : "Connect your account to continue."}
        </p>
      </div>
      <Button
        disabled={connected || connecting || unavailable || !mayConnect}
        size="sm"
        onClick={() => void connect()}
      >
        {connected
          ? "Connected"
          : connecting
            ? "Connecting…"
            : `Connect ${label}`}
      </Button>
    </div>
  );
}
export function SettingsConnectors({
  review,
  scope,
  definition,
  onChange,
  disabled,
}: {
  review?: import("@zilobase/features/ai-chat").AgentSettingsReview | null;
  scope: string;
  definition: AgentSettingsDefinition;
  onChange: (patch: Partial<AgentSettingsDefinition>) => void;
  disabled: boolean;
}) {
  return (
    <McpConnectionsPanel
      canEdit={!disabled}
      delegated={scope !== "personal"}
      scope={
        scope === "personal"
          ? { type: "personal" }
          : { type: "agent", agentProfileId: scope }
      }
      draft={{ definition, onChange, review }}
    />
  );
}
