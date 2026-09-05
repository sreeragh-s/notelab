import {
  ExternalLinkIcon,
  RefreshCw,
  Trash2Icon
} from "@/shared/components/icons"
import { toast } from "sonner"

import {
  type AiAgentProfileDetail,
  type McpConnectionScopeRef,
  type McpConnectionSummary,
  mcpScopeApiPath,
  type McpToolPolicy,
  useApprovedMcpServers,
  useMcpActivity,
  useMcpCatalog,
  useMcpConnectionMutation,
  useMcpConnections
} from "@zilobase/features/ai-chat"
import { useSession } from "@zilobase/features/auth"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Switch } from "@/shared/ui/switch"

export function PersonalMcpConnections() {
  return (
    <McpConnectionsPanel
      canEdit
      delegated={false}
      scope={{ type: "personal" }}
    />
  )
}

function McpConnectionsPanel({
  canEdit,
  delegated,
  scope,
}: {
  canEdit: boolean
  delegated: boolean
  scope: McpConnectionScopeRef
}) {
  const catalogQuery = useMcpCatalog()
  const approvedServersQuery = useApprovedMcpServers()
  const connectionsQuery = useMcpConnections(scope)
  const { data: session } = useSession()
  const basePath = mcpScopeApiPath(scope)
  const createConnection = useMcpConnectionMutation<
    {
      approvedServerId?: string
      authMethod: "oauth"
      catalogId?: string
    },
    { connection: McpConnectionSummary }
  >(scope, () => `${basePath}/connections`, "POST")
  const startOauth = useMcpConnectionMutation<
    { connectionId: string },
    { authorizationUrl: string }
  >(
    scope,
    (input) => `${basePath}/connections/${input.connectionId}/oauth/start`,
    "POST",
  )
  const connectOauth = async (server: ServerSelection) => {
    try {
      const created = await createConnection.mutateAsync({ authMethod: "oauth", ...server })
      const started = await startOauth.mutateAsync({ connectionId: created.connection.id })
      window.location.assign(started.authorizationUrl)
    } catch (error) {
      showError("Could not start connection", error)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-md border border-feedback-warning bg-feedback-warning-subtle p-3 text-sm text-feedback-warning-text">
        {delegated
          ? "Everyone with agent-use access invokes the external permissions of the member who authenticates this connection. Zilobase access checks still apply to native pages and databases."
          : "These connections are private to your account in this workspace. Custom agents cannot use them."}
      </div>

      {canEdit && (
        <div className="hidden gap-3 md:grid">
          <h4 className="text-sm font-medium">Curated connections</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {catalogQuery.data?.map((server) => {
              const connected = connectionsQuery.data?.some(
                (connection) => connection.catalogId === server.id,
              ) ?? false
              return (
                <div className="grid content-between gap-3 rounded-md border p-3" key={server.id}>
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <img alt="" className="size-6 rounded" src={server.icon} />
                      {server.label}
                    </div>
                    <p className="mt-1 text-xs text-content-secondary">
                      {server.available ? "Remote MCP server" : server.availabilityReason}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={connected || !server.available || !server.authMethods.includes("oauth")}
                      onClick={() => void connectOauth({ catalogId: server.id })}
                      size="sm"
                      type="button"
                    >
                      {connected ? "Connected" : "Connect"}
                    </Button>
                    <Button asChild size="icon" type="button" variant="ghost">
                      <a aria-label={`${server.label} documentation`} href={server.documentationUrl} rel="noreferrer" target="_blank">
                        <ExternalLinkIcon className="size-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {(approvedServersQuery.data?.length ?? 0) > 0 && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Approved custom servers</p>
              {approvedServersQuery.data?.map((server) => (
                <div className="flex flex-wrap items-center gap-2 rounded-md border p-3" key={server.id}>
                  <span className="font-medium">{server.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-content-secondary">{server.endpointUrl}</span>
                  <Button onClick={() => void connectOauth({ approvedServerId: server.id })} size="sm" type="button">
                    OAuth
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3">
        <h4 className="text-sm font-medium">Connected servers</h4>
        {connectionsQuery.data?.length ? connectionsQuery.data.map((connection) => (
          <ConnectionCard
            canDisconnect={canEdit}
            connection={connection}
            currentUserId={session?.user?.id ?? null}
            key={connection.id}
            scope={scope}
          />
        )) : <p className="text-sm text-content-secondary">No connections yet.</p>}
      </div>
    </div>
  )
}

export function AgentMcpConnections({ agent }: { agent: AiAgentProfileDetail }) {
  return (
    <McpConnectionsPanel
      canEdit={agent.role === "owner" || agent.role === "editor"}
      delegated
      scope={{ type: "agent", agentProfileId: agent.id }}
    />
  )
}

function ConnectionCard({
  canDisconnect,
  connection,
  currentUserId,
  scope,
}: {
  canDisconnect: boolean
  connection: McpConnectionSummary
  currentUserId: string | null
  scope: McpConnectionScopeRef
}) {
  const isAuthenticator = currentUserId === connection.authenticatedByUserId
  const basePath = mcpScopeApiPath(scope)
  const updateTools = useMcpConnectionMutation<
    { connectionId: string; policies: McpToolPolicyInput[] },
    { connection: McpConnectionSummary }
  >(scope, (input) => `${basePath}/connections/${input.connectionId}/tools`, "PUT")
  const refresh = useMcpConnectionMutation<
    { connectionId: string },
    { connection: McpConnectionSummary; discoveredTools: number }
  >(scope, (input) => `${basePath}/connections/${input.connectionId}/refresh`, "POST")
  const alwaysAllow = useMcpConnectionMutation<
    { connectionId: string; confirmed: boolean; enabled: boolean },
    { connection: McpConnectionSummary }
  >(scope, (input) => `${basePath}/connections/${input.connectionId}/always-allow`, "PUT")
  const disconnect = useMcpConnectionMutation<
    { connectionId: string },
    { disconnected: boolean }
  >(scope, (input) => `${basePath}/connections/${input.connectionId}`, "DELETE")

  const saveTool = async (tool: McpToolPolicy, changes: Partial<McpToolPolicy>) => {
    try {
      await updateTools.mutateAsync({
        connectionId: connection.id,
        policies: [{
          classification: changes.classification ?? tool.classification,
          enabled: changes.enabled ?? tool.enabled,
          executionMode: changes.executionMode ?? tool.executionMode,
          toolId: tool.id,
        }],
      })
    } catch (error) {
      showError("Could not update tool", error)
    }
  }

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{connection.serverLabel}</span>
        <Badge variant="outline">{connection.state.replaceAll("_", " ")}</Badge>
        <span className="text-xs text-content-secondary">
          authenticated by {isAuthenticator ? "you" : "another member"}
        </span>
        <div className="ml-auto hidden gap-1 md:flex">
          {isAuthenticator && (
            <Button
              aria-label="Refresh tool discovery"
              onClick={() => void refresh.mutateAsync({ connectionId: connection.id }).catch((error) => showError("Discovery failed", error))}
              size="icon"
              type="button"
              variant="ghost"
            ><RefreshCw className="size-4" /></Button>
          )}
          {canDisconnect && (
            <Button
              aria-label="Disconnect server"
              onClick={() => {
                if (window.confirm("Disconnect this server? Existing imported databases will remain.")) {
                  void disconnect.mutateAsync({ connectionId: connection.id })
                }
              }}
              size="icon"
              type="button"
              variant="ghost"
            ><Trash2Icon className="size-4" /></Button>
          )}
        </div>
      </div>

      {isAuthenticator && (
        <label className="hidden items-center justify-between gap-3 rounded-md bg-surface-secondary p-2 text-sm md:flex">
          <span>
            Always allow all enabled tools
            <span className="block text-xs text-content-secondary">New and changed tools stay disabled.</span>
          </span>
          <Switch
            checked={connection.alwaysAllowEnabled}
            onCheckedChange={(enabled) => {
              if (enabled && !window.confirm("Enabled write tools may change external data without asking each time. Continue?")) return
              void alwaysAllow.mutateAsync({ confirmed: enabled, connectionId: connection.id, enabled })
            }}
          />
        </label>
      )}

      <div className="grid gap-2">
        {connection.tools?.map((tool) => (
          <div className="grid gap-2 rounded border p-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-center" key={tool.id}>
            <label className="flex min-w-0 gap-2 text-sm">
              <Checkbox
                checked={tool.enabled}
                className="hidden md:flex"
                disabled={!isAuthenticator || !tool.available}
                onCheckedChange={(checked) => void saveTool(tool, { enabled: checked === true })}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{tool.externalName}</span>
                <span className="block truncate text-xs text-content-secondary">{tool.available ? tool.description : "Unavailable"}</span>
              </span>
            </label>
            <Select
              disabled={!isAuthenticator}
              onValueChange={(classification) => void saveTool(tool, { classification: classification as McpToolPolicy["classification"] })}
              value={tool.classification}
            >
              <SelectTrigger className="hidden md:flex"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="write">Write</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select
              disabled={!isAuthenticator}
              onValueChange={(executionMode) => void saveTool(tool, { executionMode: executionMode as McpToolPolicy["executionMode"] })}
              value={tool.executionMode}
            >
              <SelectTrigger className="hidden md:flex"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="always_ask">Always ask</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}

type McpToolPolicyInput = Pick<McpToolPolicy, "classification" | "enabled" | "executionMode"> & {
  toolId: string
}

type ServerSelection = { catalogId: string } | { approvedServerId: string }

export function AgentMcpActivity({ agent }: { agent: AiAgentProfileDetail }) {
  const activityQuery = useMcpActivity({ type: "agent", agentProfileId: agent.id }, true)
  return <McpActivityList activity={activityQuery.data} />
}

export function PersonalMcpActivity() {
  const activityQuery = useMcpActivity({ type: "personal" }, true)
  return <McpActivityList activity={activityQuery.data} privateActivity />
}

function McpActivityList({
  activity,
  privateActivity = false,
}: {
  activity: ReturnType<typeof useMcpActivity>["data"]
  privateActivity?: boolean
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-content-secondary">
        {privateActivity
          ? "Private operational activity. Credentials, arguments, and returned data are never recorded here."
          : "Sanitized operational activity only. Prompts, arguments, credentials, and returned external data are never shown here."}
      </p>
      {activity?.length ? activity.map((entry) => (
        <div className="flex flex-wrap items-center gap-2 border-b py-2 text-sm" key={entry.id}>
          <span className="font-medium">{entry.eventType.replaceAll("_", " ")}</span>
          {entry.providerLabel && <span>{entry.providerLabel}</span>}
          {entry.toolName && <code className="text-xs">{entry.toolName}</code>}
          <Badge className="ml-auto" variant="outline">{entry.outcome}</Badge>
        </div>
      )) : <p className="text-sm text-content-secondary">No activity yet.</p>}
    </div>
  )
}

function showError(title: string, error: unknown) {
  toast.error(title, {
    description: error instanceof Error ? error.message : "Try again.",
  })
}
