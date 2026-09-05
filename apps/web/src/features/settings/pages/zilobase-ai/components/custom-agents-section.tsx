import * as React from "react"
import {
  ExternalLinkIcon,
  PlusIcon,
  RefreshCw,
  Trash2Icon,
} from "@/shared/components/icons"
import { toast } from "sonner"

import { useSession } from "@zilobase/features/auth"
import {
  type AiAgentProfileDetail,
  type McpApprovedServer,
  type McpConnectionSummary,
  type McpConnectionScopeRef,
  type McpToolPolicy,
  type McpWorkspacePolicy,
  useApprovedMcpServers,
  useArchiveAiAgentProfile,
  useAiAgentProfile,
  useAiAgentProfiles,
  useCreateAiAgentProfile,
  useMcpActivity,
  useMcpCatalog,
  useMcpConnectionMutation,
  useMcpConnections,
  mcpScopeApiPath,
  useMcpPolicyMutation,
  useMcpWorkspacePolicy,
  useReplaceAiAgentProfileAccess,
  useTransferAiAgentProfile,
  useUpdateAiAgentProfile,
  useWorkspaceAiModels,
} from "@zilobase/features/ai-chat"

import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { Checkbox } from "@/shared/ui/checkbox"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Switch } from "@/shared/ui/switch"
import { Textarea } from "@/shared/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"

type AgentTab = "instructions" | "tools" | "share" | "activity"

export function CustomAgentsSection() {
  const profilesQuery = useAiAgentProfiles()
  const createProfile = useCreateAiAgentProfile()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [newName, setNewName] = React.useState("")

  React.useEffect(() => {
    if (!selectedId && profilesQuery.data?.[0]) {
      setSelectedId(profilesQuery.data[0].id)
    }
  }, [profilesQuery.data, selectedId])

  if (profilesQuery.isError) {
    return (
      <section className="grid gap-2">
        <h3 className="font-heading text-base font-medium">Custom Agents</h3>
        <p className="text-sm text-content-secondary">
          Custom Agents and MCP connectors are not enabled for this deployment.
        </p>
      </section>
    )
  }

  const create = async () => {
    if (!newName.trim()) return
    try {
      const result = await createProfile.mutateAsync({ name: newName.trim() })
      setNewName("")
      setSelectedId(result.agent.id)
      toast.success("Custom Agent created.")
    } catch (error) {
      showError("Could not create agent", error)
    }
  }

  return (
    <section className="grid gap-4">
      <div className="space-y-1">
        <h3 className="font-heading text-base font-medium">Custom Agents</h3>
        <p className="text-sm text-content-secondary">
          Create standalone sandboxed agents with a shared builder and run
          timeline, explicit resource access, and approved external tools.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="New agent name"
          className="max-w-sm"
          maxLength={120}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create()
          }}
          placeholder="Agent name"
          value={newName}
        />
        <Button
          disabled={!newName.trim() || createProfile.isPending}
          onClick={() => void create()}
          type="button"
        >
          <PlusIcon className="size-4" />
          Create agent
        </Button>
      </div>

      {(profilesQuery.data?.length ?? 0) > 0 && (
        <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <nav className="grid content-start gap-1" aria-label="Custom agents">
            {profilesQuery.data?.map((agent) => (
              <Button
                className="justify-start"
                key={agent.id}
                onClick={() => setSelectedId(agent.id)}
                type="button"
                variant={selectedId === agent.id ? "secondary" : "ghost"}
              >
                <span className="truncate">{agent.name}</span>
                <Badge className="ml-auto" variant="outline">
                  {agent.role}
                </Badge>
              </Button>
            ))}
          </nav>
          <AgentEditor agentId={selectedId} />
        </div>
      )}
      <WorkspaceMcpPolicyPanel />
    </section>
  )
}

export function AgentEditor({
  agentId,
  initialTab,
  plain = false,
  showActivity = true,
}: {
  agentId: string | null
  initialTab?: string | null
  plain?: boolean
  showActivity?: boolean
}) {
  const detailQuery = useAiAgentProfile(agentId)
  const [tab, setTab] = React.useState<AgentTab>(() => normalizeAgentTab(initialTab))

  React.useEffect(() => setTab(normalizeAgentTab(initialTab)), [initialTab])

  if (!agentId || detailQuery.isLoading) {
    return <p className="text-sm text-content-secondary">Loading agent...</p>
  }
  if (!detailQuery.data) {
    return <p className="text-sm text-content-secondary">Agent unavailable.</p>
  }

  const tabs: Array<{ id: AgentTab; label: string }> = [
    { id: "instructions", label: "Instructions" },
    { id: "tools", label: "Tools & Access" },
    { id: "share", label: "Share" },
    ...(showActivity && detailQuery.data.role !== "user"
      ? [{ id: "activity" as const, label: "Activity" }]
      : []),
  ]

  return (
    <Tabs
      className={plain ? "min-w-0 gap-5" : "min-w-0 gap-4 rounded-lg border p-4"}
      onValueChange={(value) => setTab(value as AgentTab)}
      value={tab}
    >
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList>
          {tabs.map((item) => (
            <TabsTrigger
              className="grow-0"
              key={item.id}
              value={item.id}
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div>
        {tab === "instructions" && <AgentInstructions agent={detailQuery.data} />}
        {tab === "tools" && (
          <McpConnectionsPanel
            canEdit={detailQuery.data.role === "owner" || detailQuery.data.role === "editor"}
            delegated
            scope={{ type: "agent", agentProfileId: detailQuery.data.id }}
          />
        )}
        {tab === "share" && <AgentShare agent={detailQuery.data} />}
        {tab === "activity" && <AgentActivity agent={detailQuery.data} />}
      </div>
    </Tabs>
  )
}

function AgentInstructions({ agent }: { agent: AiAgentProfileDetail }) {
  const update = useUpdateAiAgentProfile(agent.id)
  const modelsQuery = useWorkspaceAiModels()
  const [name, setName] = React.useState(agent.name)
  const [description, setDescription] = React.useState(agent.description)
  const [instructions, setInstructions] = React.useState(agent.instructions)
  const [defaultModel, setDefaultModel] = React.useState(agent.defaultModel)

  React.useEffect(() => {
    setName(agent.name)
    setDescription(agent.description)
    setInstructions(agent.instructions)
    setDefaultModel(agent.defaultModel)
  }, [agent])

  const save = async () => {
    try {
      await update.mutateAsync({ defaultModel, description, instructions, name })
      toast.success("Agent saved.")
    } catch (error) {
      showError("Could not save agent", error)
    }
  }

  const canEdit = agent.role === "owner" || agent.role === "editor"
  return (
    <div className="grid gap-3">
      <Input disabled={!canEdit} onChange={(event) => setName(event.target.value)} value={name} />
      <Input
        disabled={!canEdit}
        maxLength={500}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What this agent is for"
        value={description}
      />
      <Textarea
        className="min-h-40"
        disabled={!canEdit}
        maxLength={20_000}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Instructions applied to every conversation with this agent"
        value={instructions}
      />
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Default model</span>
        <Select disabled={!canEdit} onValueChange={setDefaultModel} value={defaultModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            {modelsQuery.data?.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {canEdit && (
        <Button className="w-fit" disabled={update.isPending} onClick={() => void save()} type="button">
          Save agent
        </Button>
      )}
    </div>
  )
}

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

function AgentShare({ agent }: { agent: AiAgentProfileDetail }) {
  const replaceAccess = useReplaceAiAgentProfileAccess(agent.id)
  const transferOwnership = useTransferAiAgentProfile(agent.id)
  const archiveAgent = useArchiveAiAgentProfile(agent.id)
  const [principalId, setPrincipalId] = React.useState("")
  const [principalType, setPrincipalType] = React.useState<"user" | "team">("user")
  const [role, setRole] = React.useState<"editor" | "user">("user")
  const [newOwnerUserId, setNewOwnerUserId] = React.useState("")
  const canEdit = agent.role === "owner" || agent.role === "editor"

  const save = async (grants: AiAgentProfileDetail["access"]) => {
    try {
      await replaceAccess.mutateAsync({
        grants: grants.map(({ principalId: id, principalType: type, role: grantRole }) => ({
          principalId: id,
          principalType: type,
          role: grantRole,
        })),
      })
      setPrincipalId("")
      toast.success("Agent sharing updated.")
    } catch (error) {
      showError("Could not update sharing", error)
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-content-secondary">
        Everyone with agent access can see its shared Chat and run summaries.
        Only editors can change configuration; sensitive tool arguments and
        diagnostics remain editor-only.
      </p>
      {agent.access.map((grant) => (
        <div className="flex items-center gap-2 rounded border p-2 text-sm" key={grant.id}>
          <Badge variant="outline">{grant.principalType}</Badge>
          <span className="truncate">{grant.principalId}</span>
          <span className="ml-auto">{grant.role}</span>
          {canEdit && (
            <Button
              aria-label="Remove access"
              onClick={() => void save(agent.access.filter((item) => item.id !== grant.id))}
              size="icon"
              type="button"
              variant="ghost"
            ><Trash2Icon className="size-4" /></Button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Select onValueChange={(value) => setPrincipalType(value as "user" | "team")} value={principalType}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="team">Team</SelectItem></SelectContent>
          </Select>
          <Input className="min-w-44 flex-1" onChange={(event) => setPrincipalId(event.target.value)} placeholder={`${principalType} ID`} value={principalId} />
          <Select onValueChange={(value) => setRole(value as "editor" | "user")} value={role}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="editor">Editor</SelectItem></SelectContent>
          </Select>
          <Button disabled={!principalId.trim()} onClick={() => void save([...agent.access, { id: crypto.randomUUID(), principalId: principalId.trim(), principalType, role }])} type="button">Add</Button>
        </div>
      )}
      {agent.role === "owner" && (
        <div className="mt-3 grid gap-2 border-t pt-3">
          <p className="text-sm font-medium">Ownership and lifecycle</p>
          <p className="text-xs text-content-secondary">
            Transferring ownership does not transfer connector credentials. All
            connections will require their authenticators to reconnect.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-48 flex-1" onChange={(event) => setNewOwnerUserId(event.target.value)} placeholder="New owner user ID" value={newOwnerUserId} />
            <Button
              disabled={!newOwnerUserId.trim() || transferOwnership.isPending}
              onClick={() => {
                if (window.confirm("Transfer this agent and require every connection to reauthenticate?")) {
                  void transferOwnership.mutateAsync({ newOwnerUserId: newOwnerUserId.trim() })
                    .then(() => toast.success("Agent ownership transferred."))
                    .catch((error) => showError("Could not transfer ownership", error))
                }
              }}
              type="button"
              variant="outline"
            >Transfer ownership</Button>
            <Button
              disabled={archiveAgent.isPending}
              onClick={() => {
                if (window.confirm("Archive this agent? Its shared history stays readable, but no new runs or connector calls can start.")) {
                  void archiveAgent.mutateAsync({})
                    .then(() => toast.success("Agent archived."))
                    .catch((error) => showError("Could not archive agent", error))
                }
              }}
              type="button"
              variant="destructive"
            >Archive agent</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentActivity({ agent }: { agent: AiAgentProfileDetail }) {
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

export function WorkspaceMcpPolicyPanel() {
  const policyQuery = useMcpWorkspacePolicy()
  const [customServersEnabled, setCustomServersEnabled] = React.useState(false)
  const [externalWritesEnabled, setExternalWritesEnabled] = React.useState(false)
  const [installationPolicy, setInstallationPolicy] = React.useState<McpWorkspacePolicy["installationPolicy"]>("approved_and_catalog")
  const [serverLabel, setServerLabel] = React.useState("")
  const [serverUrl, setServerUrl] = React.useState("")
  const updatePolicy = useMcpPolicyMutation<McpWorkspacePolicy, { policy: McpWorkspacePolicy }>(
    () => "/api/ai/mcp/policy",
    "PUT",
  )
  const addServer = useMcpPolicyMutation<
    { endpointUrl: string; label: string },
    { server: McpApprovedServer }
  >(() => "/api/ai/mcp/approved-servers", "POST")
  const removeServer = useMcpPolicyMutation<
    { serverId: string },
    { removed: boolean }
  >((input) => `/api/ai/mcp/approved-servers/${input.serverId}`, "DELETE")

  React.useEffect(() => {
    if (!policyQuery.data) return
    setCustomServersEnabled(policyQuery.data.policy.customServersEnabled)
    setExternalWritesEnabled(policyQuery.data.policy.externalWritesEnabled)
    setInstallationPolicy(policyQuery.data.policy.installationPolicy)
  }, [policyQuery.data])

  if (!policyQuery.data) return null

  const savePolicy = async () => {
    try {
      await updatePolicy.mutateAsync({
        customServersEnabled,
        externalWritesEnabled,
        installationPolicy,
        workspaceId: policyQuery.data.policy.workspaceId,
      })
      toast.success("Workspace MCP policy saved.")
    } catch (error) {
      showError("Could not save MCP policy", error)
    }
  }

  const approveServer = async () => {
    try {
      await addServer.mutateAsync({ endpointUrl: serverUrl.trim(), label: serverLabel.trim() })
      setServerLabel("")
      setServerUrl("")
      toast.success("Custom MCP server approved.")
    } catch (error) {
      showError("Could not approve server", error)
    }
  }

  return (
    <div className="hidden gap-3 rounded-lg border p-4 md:grid">
      <div>
        <h4 className="text-sm font-medium">Workspace MCP policy</h4>
        <p className="text-xs text-content-secondary">Visible to workspace owners and admins.</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        Allow approved custom HTTPS servers
        <Switch checked={customServersEnabled} onCheckedChange={setCustomServersEnabled} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Allow external write tools
        <Switch checked={externalWritesEnabled} onCheckedChange={setExternalWritesEnabled} />
      </label>
      <label className="grid gap-1 text-sm">
        Installation policy
        <Select onValueChange={(value) => setInstallationPolicy(value as McpWorkspacePolicy["installationPolicy"])} value={installationPolicy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="approved_and_catalog">Approved and curated catalog</SelectItem>
            <SelectItem value="approved_only">Approved servers only</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button className="w-fit" disabled={updatePolicy.isPending} onClick={() => void savePolicy()} type="button">Save policy</Button>

      <div className="mt-2 grid gap-2 border-t pt-3">
        <p className="text-sm font-medium">Exact approved server URLs</p>
        {policyQuery.data.approvedServers.map((server) => (
          <div className="flex min-w-0 items-center gap-2 text-sm" key={server.id}>
            <span className="font-medium">{server.label}</span>
            <span className="min-w-0 flex-1 truncate text-content-secondary">{server.endpointUrl}</span>
            <Button aria-label="Remove approved server" onClick={() => void removeServer.mutateAsync({ serverId: server.id })} size="icon" type="button" variant="ghost">
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input className="w-36" onChange={(event) => setServerLabel(event.target.value)} placeholder="Server label" value={serverLabel} />
          <Input className="min-w-52 flex-1" onChange={(event) => setServerUrl(event.target.value)} placeholder="https://mcp.example.com/mcp" type="url" value={serverUrl} />
          <Button disabled={!serverLabel.trim() || !serverUrl.trim()} onClick={() => void approveServer()} type="button">Approve</Button>
        </div>
      </div>
    </div>
  )
}

function showError(title: string, error: unknown) {
  toast.error(title, {
    description: error instanceof Error ? error.message : "Try again.",
  })
}

function normalizeAgentTab(value?: string | null): AgentTab {
  if (value === "connectors" || value === "tools") return "tools"
  if (value === "share" || value === "activity") return value
  return "instructions"
}
