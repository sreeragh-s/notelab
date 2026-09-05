import { useParams, useRouter, useRouterState } from "@tanstack/react-router"
import {
  useAiAgentProfile,
  useCreateCustomAgentTrigger,
  useCustomAgentConversation,
  useCustomAgentLegacyConversations,
  useCustomAgentResources,
  useCustomAgentRevisions,
  useCustomAgentRuns,
  useCustomAgentTriggers,
  useGrantCustomAgentResource,
  useRemoveCustomAgentResource,
  useRemoveCustomAgentTrigger,
  useRevertCustomAgentRevision,
  useRotateCustomAgentWebhookSecret,
  useStartCustomAgentRun,
  useSubmitCustomAgentMessage,
  useUpdateAiAgentProfile,
  useUpdateCustomAgentTrigger,
  type AiAgentProfileDetail,
  type CustomAgentTriggerKind,
} from "@zilobase/features/ai-chat"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import * as React from "react"
import { toast } from "sonner"

import { AgentInstructions } from "@/features/ai/components/settings/agent-instructions"
import { AgentShare } from "@/features/ai/components/settings/agent-sharing"
import {
  AgentMcpActivity,
  AgentMcpConnections,
} from "@/features/ai/components/settings/mcp-connections"
import { PageMetadata } from "@/features/databases"
import { PageSidePaneLayout } from "@/features/pages/context"
import {
  BotIcon,
  KeyRoundIcon,
  Play,
  SendIcon,
  Trash2Icon,
} from "@/shared/components/icons"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"

type AgentPanelTab =
  | "overview"
  | "tools"
  | "triggers"
  | "activity"
  | "share"
  | "versions"

const DEFAULT_AGENT_NAME = "Untitled agent"

function getAgentTitleDraft(name: string) {
  return name === DEFAULT_AGENT_NAME ? "" : name
}

export default function CustomAgentPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string }
  const router = useRouter()
  const { hash, pathname, searchStr } = useRouterState({
    select: (state) => ({
      hash: state.location.hash,
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  })
  const agentQuery = useAiAgentProfile(agentId)
  const updateAgent = useUpdateAiAgentProfile(agentId)
  const workspaceId = useActiveWorkspaceId()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [cover, setCover] = React.useState("")
  const [icon, setIcon] = React.useState("")
  const [iconPosition, setIconPosition] = React.useState<"inline" | "top">(
    "inline",
  )
  const search = new URLSearchParams(searchStr)
  const panelOpen = search.get("panel") === "settings"
  const panelTab = normalizePanelTab(search.get("settingsTab"))

  React.useEffect(() => {
    if (!agentQuery.data) return
    setName(getAgentTitleDraft(agentQuery.data.name))
    setDescription(agentQuery.data.description)
    setCover(agentQuery.data.cover ?? "")
    setIcon(
      typeof agentQuery.data.icon === "string" ? agentQuery.data.icon : "",
    )
    setIconPosition(agentQuery.data.iconPosition ?? "inline")
  }, [agentQuery.data?.id])

  const saveTitle = async () => {
    const next = name.trim() || DEFAULT_AGENT_NAME
    if (!agentQuery.data || next === agentQuery.data.name) return
    try {
      await updateAgent.mutateAsync({ name: next })
    } catch (error) {
      setName(getAgentTitleDraft(agentQuery.data.name))
      toast.error(
        error instanceof Error ? error.message : "Could not rename agent.",
      )
    }
  }

  const saveDescription = async () => {
    if (!agentQuery.data || description === agentQuery.data.description) return
    try {
      await updateAgent.mutateAsync({ description })
    } catch (error) {
      setDescription(agentQuery.data.description)
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update agent description.",
      )
    }
  }

  const saveAppearance = async (
    patch: {
      cover?: string | null
      icon?: string
      iconPosition?: "inline" | "top"
    },
    rollback: () => void,
  ) => {
    try {
      await updateAgent.mutateAsync(patch)
    } catch (error) {
      rollback()
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update agent appearance.",
      )
    }
  }

  const setPanel = (nextTab: AgentPanelTab | null) => {
    const nextSearch = new URLSearchParams(searchStr)
    if (nextTab) {
      nextSearch.set("panel", "settings")
      nextSearch.set("settingsTab", nextTab)
    } else {
      nextSearch.delete("panel")
      nextSearch.delete("settingsTab")
    }
    const query = nextSearch.toString()
    router.history.replace(`${pathname}${query ? `?${query}` : ""}${hash}`)
  }

  if (agentQuery.isLoading)
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-secondary">
        Loading agent…
      </div>
    )
  if (!agentQuery.data)
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-secondary">
        Agent unavailable.
      </div>
    )

  const main = (
    <main className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <PageMetadata
          contentClassName="mx-auto max-w-[900px]"
          cover={cover}
          description={description}
          descriptionPlaceholder="Describe what this agent does…"
          editable={agentQuery.data.role !== "user"}
          enableComments={false}
          headingLabel="Agent"
          icon={icon}
          iconPosition={iconPosition}
          onCoverChange={(nextCover) => {
            const previous = cover
            setCover(nextCover)
            void saveAppearance({ cover: nextCover || null }, () =>
              setCover(previous),
            )
          }}
          onDescriptionBlur={() => void saveDescription()}
          onDescriptionChange={setDescription}
          onIconChange={(nextIcon) => {
            const previous = icon
            setIcon(nextIcon)
            void saveAppearance({ icon: nextIcon }, () => setIcon(previous))
          }}
          onIconPositionChange={(nextPosition) => {
            const previous = iconPosition
            setIconPosition(nextPosition)
            void saveAppearance({ iconPosition: nextPosition }, () =>
              setIconPosition(previous),
            )
          }}
          onTitleBlur={() => void saveTitle()}
          onTitleChange={setName}
          title={name}
          titlePlaceholder="Untitled agent"
          workspaceId={workspaceId}
        />
        <div className="mx-auto flex min-h-[calc(100%-10rem)] w-full max-w-[900px] flex-col px-5 sm:px-8 md:px-20 lg:px-24">
          <AgentChat agentId={agentId} />
        </div>
      </div>
    </main>
  )

  return (
    <PageSidePaneLayout
      main={main}
      mainScrollClassName="overscroll-y-none"
      sidePane={
        panelOpen ? (
          <AgentSidePanel
            agent={agentQuery.data}
            agentId={agentId}
            onTabChange={setPanel}
            tab={panelTab}
          />
        ) : null
      }
      sidePaneOpen={panelOpen}
      sidePaneVisible={panelOpen}
    />
  )
}

function AgentChat({ agentId }: { agentId: string }) {
  const conversation = useCustomAgentConversation(agentId)
  const legacyConversations = useCustomAgentLegacyConversations(agentId)
  const submit = useSubmitCustomAgentMessage(agentId)
  const startRun = useStartCustomAgentRun(agentId)
  const resources = useCustomAgentResources(agentId)
  const [message, setMessage] = React.useState("")
  const send = async () => {
    const value = message.trim()
    if (!value || submit.isPending) return
    setMessage("")
    try {
      await submit.mutateAsync({
        clientId: crypto.randomUUID(),
        message: value,
      })
    } catch (error) {
      setMessage(value)
      toast.error(
        error instanceof Error ? error.message : "Could not send message.",
      )
    }
  }
  const run = async () => {
    if (startRun.isPending) return
    const prompt = message.trim()
    try {
      await startRun.mutateAsync(prompt ? { prompt } : {})
      setMessage("")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not start the agent run.",
      )
    }
  }
  const messages = conversation.data?.messages ?? []
  return (
    <section className="flex min-h-[32rem] flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 py-4">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-lg bg-surface-secondary">
              <BotIcon className="size-6" />
            </span>
            <h2 className="font-heading text-xl font-medium">
              Build this agent through chat
            </h2>
            <p className="text-sm text-content-secondary">
              This agent currently has {resources.data?.resources.length ?? 0}{" "}
              granted resources and no implicit workspace access. Ask it to
              change its instructions, or run the saved configuration.
            </p>
          </div>
        ) : (
          messages.map((item) => (
            <article
              className={
                item.role === "user"
                  ? "ml-auto max-w-2xl rounded-lg bg-surface-secondary px-4 py-3"
                  : "max-w-3xl py-2"
              }
              key={item.id}
            >
              {item.parts.map((part, index) => (
                <MessagePart key={index} part={part} />
              ))}
            </article>
          ))
        )}
        {(legacyConversations.data?.conversations.length ?? 0) > 0 ? (
          <details className="mt-8 rounded-lg bg-surface-secondary p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Your private legacy agent chats
            </summary>
            <p className="mt-1 text-xs text-content-secondary">
              These earlier Ask AI conversations remain private to you and are
              read-only.
            </p>
            <div className="mt-4 space-y-5">
              {legacyConversations.data?.conversations.map((legacy) => (
                <section className="space-y-2" key={legacy.id}>
                  <p className="text-xs text-content-secondary">
                    {new Date(legacy.lastActivityAt).toLocaleString()}
                  </p>
                  {legacy.messages.map((item) => (
                    <article
                      className={
                        item.role === "user"
                          ? "ml-auto max-w-2xl rounded-lg bg-control-background px-3 py-2"
                          : "max-w-3xl py-1"
                      }
                      key={item.id}
                    >
                      {item.parts.map((part, index) => (
                        <MessagePart key={index} part={part} />
                      ))}
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="sticky bottom-4 rounded-xl border border-control-border bg-control-background p-2 shadow-sm">
        <Textarea
          aria-label="Message this agent"
          className="min-h-24 border-0 bg-transparent shadow-none focus-visible:ring-0"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder="Describe how to configure the agent, ask it to run, or do both…"
          value={message}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <span className="text-xs text-content-secondary">
            Configuration changes create a reversible revision.
          </span>
          <div className="flex items-center gap-1">
            <Button
              disabled={startRun.isPending}
              onClick={() => void run()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Play className="size-4" /> Run
            </Button>
            <Button
              aria-label="Send"
              disabled={!message.trim() || submit.isPending}
              onClick={() => void send()}
              size="icon"
              type="button"
            >
              <SendIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function MessagePart({ part }: { part: unknown }) {
  if (!part || typeof part !== "object") return null
  const value = part as Record<string, unknown>
  if (value.type === "revision") {
    return (
      <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-secondary p-3 text-xs">
        {JSON.stringify(value.definition, null, 2)}
      </pre>
    )
  }
  return typeof value.text === "string" ? (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">{value.text}</p>
  ) : null
}

function AgentSidePanel({
  agent,
  agentId,
  onTabChange,
  tab,
}: {
  agent: AiAgentProfileDetail
  agentId: string
  onTabChange: (tab: AgentPanelTab) => void
  tab: AgentPanelTab
}) {
  const tabs: Array<{ id: AgentPanelTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "tools", label: "Tools & Access" },
    { id: "triggers", label: "Triggers" },
    { id: "activity", label: "Activity" },
    { id: "share", label: "Share" },
    { id: "versions", label: "Versions" },
  ]

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface-canvas dark:bg-surface-navigation">
      <div className="shrink-0 px-5 pb-3 pt-4">
        <h2 className="truncate font-heading text-base font-medium">
          {agent.name}
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Build, run, and control this sandboxed Custom Agent.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <Tabs
          className="gap-5"
          onValueChange={(value) => onTabChange(value as AgentPanelTab)}
          value={tab}
        >
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList aria-label="Custom Agent settings">
              {tabs.map((item) => (
                <TabsTrigger className="grow-0" key={item.id} value={item.id}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <AgentSettingsPanel agent={agent} agentId={agentId} tab={tab} />
        </Tabs>
      </div>
    </aside>
  )
}

function AgentActivity({ agentId }: { agentId: string }) {
  const runs = useCustomAgentRuns(agentId)
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-medium">Runs</h2>
      {(runs.data?.runs ?? []).length === 0 ? (
        <p className="text-sm text-content-secondary">No runs yet.</p>
      ) : null}
      {runs.data?.runs.map((run) => (
        <div className="rounded-lg bg-surface-secondary p-4" key={run.id}>
          <div className="flex items-center gap-2">
            <Play className="size-4" />
            <strong className="text-sm capitalize">
              {run.status.replace("_", " ")}
            </strong>
            <span className="ml-auto text-xs text-content-secondary">
              Revision {run.revisionId.slice(0, 8)}
            </span>
          </div>
          {run.outputSummary ? (
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {run.outputSummary}
            </p>
          ) : null}
          {run.errorSummary ? (
            <p className="mt-2 text-sm text-feedback-danger-text">
              {run.errorSummary}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  )
}

function AgentSettingsPanel({
  agent,
  agentId,
  tab,
}: {
  agent: AiAgentProfileDetail
  agentId: string
  tab: AgentPanelTab
}) {
  const state = useAgentSettingsState(agentId)
  if (tab === "overview") {
    return <AgentInstructions agent={agent} />
  }

  if (tab === "tools") return <AgentToolsSettings agent={agent} state={state} />

  if (tab === "triggers") return <AgentTriggersSettings state={state} />

  if (tab === "activity") {
    return (
      <div className="grid gap-8">
        <AgentActivity agentId={agentId} />
        <section className="grid gap-3">
          <h2 className="font-heading text-lg font-medium">
            Connector activity
          </h2>
          <AgentMcpActivity agent={agent} />
        </section>
      </div>
    )
  }

  if (tab === "share") {
    return <AgentShare agent={agent} />
  }

  return <AgentVersionSettings state={state} />
}

function useAgentSettingsState(agentId: string) {
  const resources = useCustomAgentResources(agentId)
  const grant = useGrantCustomAgentResource(agentId)
  const removeResource = useRemoveCustomAgentResource(agentId)
  const triggers = useCustomAgentTriggers(agentId)
  const createTrigger = useCreateCustomAgentTrigger(agentId)
  const updateTrigger = useUpdateCustomAgentTrigger(agentId)
  const removeTrigger = useRemoveCustomAgentTrigger(agentId)
  const rotateWebhookSecret = useRotateCustomAgentWebhookSecret(agentId)
  const revisions = useCustomAgentRevisions(agentId)
  const revert = useRevertCustomAgentRevision(agentId)
  const [resourceId, setResourceId] = React.useState("")
  const [resourceType, setResourceType] = React.useState<"page" | "database">(
    "page",
  )
  const [resourceAccess, setResourceAccess] = React.useState<
    "view" | "comment" | "edit"
  >("view")
  const [triggerKind, setTriggerKind] =
    React.useState<Exclude<CustomAgentTriggerKind, "manual">>("schedule")
  const [triggerLabel, setTriggerLabel] = React.useState("Daily")
  const [triggerTarget, setTriggerTarget] = React.useState("")
  const [databaseEvent, setDatabaseEvent] = React.useState<
    "row_added" | "row_removed" | "property_changed"
  >("property_changed")
  const [databasePropertyId, setDatabasePropertyId] = React.useState("")
  const [scheduleCadence, setScheduleCadence] = React.useState("daily")
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] =
    React.useState("60")
  const [revealedWebhookSecret, setRevealedWebhookSecret] = React.useState<
    string | null
  >(null)

  const addResource = async () => {
    const id = resourceId.trim()
    if (!id || grant.isPending) return
    try {
      await grant.mutateAsync({
        accessLevel: resourceAccess,
        resourceId: id,
        resourceType,
      })
      setResourceId("")
      toast.success("Agent resource access updated.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not grant resource access.",
      )
    }
  }

  const addTrigger = async () => {
    const label = triggerLabel.trim()
    if (!label || createTrigger.isPending) return
    const target = triggerTarget.trim()
    let config: Record<string, unknown>
    try {
      config = buildTriggerConfig({
        triggerKind,
        target,
        scheduleCadence,
        scheduleIntervalMinutes,
        databaseEvent,
        databasePropertyId,
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Invalid trigger configuration.",
      )
      return
    }
    if (needsTriggerTarget(triggerKind) && !target) {
      toast.error("Enter the resource or adapter identifier for this trigger.")
      return
    }
    try {
      await createTrigger.mutateAsync({ config, kind: triggerKind, label })
      setTriggerTarget("")
      setDatabasePropertyId("")
      toast.success("Agent trigger added.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add trigger.",
      )
    }
  }

  return {
    resources,
    grant,
    removeResource,
    triggers,
    createTrigger,
    updateTrigger,
    removeTrigger,
    rotateWebhookSecret,
    revisions,
    revert,
    resourceId,
    setResourceId,
    resourceType,
    setResourceType,
    resourceAccess,
    setResourceAccess,
    triggerKind,
    setTriggerKind,
    triggerLabel,
    setTriggerLabel,
    triggerTarget,
    setTriggerTarget,
    databaseEvent,
    setDatabaseEvent,
    databasePropertyId,
    setDatabasePropertyId,
    scheduleCadence,
    setScheduleCadence,
    scheduleIntervalMinutes,
    setScheduleIntervalMinutes,
    revealedWebhookSecret,
    setRevealedWebhookSecret,
    addResource,
    addTrigger,
  }
}

function AgentToolsSettings({
  agent,
  state,
}: {
  agent: AiAgentProfileDetail
  state: ReturnType<typeof useAgentSettingsState>
}) {
  const {
    resources,
    grant,
    removeResource,
    resourceId,
    setResourceId,
    resourceType,
    setResourceType,
    resourceAccess,
    setResourceAccess,
    addResource,
  } = state
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Resource access</h2>
          <p className="text-sm text-content-secondary">
            Only explicitly granted resources are available to this agent.
          </p>
        </div>
        {resources.data?.resources.map((resource) => (
          <div
            className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm"
            key={`${resource.resourceType}:${resource.resourceId}`}
          >
            <span className="min-w-0 flex-1 truncate">{resource.name}</span>
            <span className="text-xs capitalize text-content-secondary">
              {resource.resourceType} · {resource.accessLevel}
            </span>
            <Button
              aria-label={`Remove ${resource.name}`}
              disabled={removeResource.isPending}
              onClick={() =>
                void removeResource
                  .mutateAsync({
                    resourceId: resource.resourceId,
                    resourceType: resource.resourceType,
                  })
                  .catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not remove access.",
                    ),
                  )
              }
              size="icon-sm"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Select
            onValueChange={(value) =>
              setResourceType(value as "page" | "database")
            }
            value={resourceType}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">Page</SelectItem>
              <SelectItem value="database">Database</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="min-w-48 flex-1"
            onChange={(event) => setResourceId(event.target.value)}
            placeholder={`${resourceType === "page" ? "Page" : "Database"} ID`}
            value={resourceId}
          />
          <Select
            onValueChange={(value) =>
              setResourceAccess(value as "view" | "comment" | "edit")
            }
            value={resourceAccess}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View</SelectItem>
              {resourceType === "page" ? (
                <SelectItem value="comment">Comment</SelectItem>
              ) : null}
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={!resourceId.trim() || grant.isPending}
            onClick={() => void addResource()}
          >
            Grant access
          </Button>
        </div>
      </section>
      <section className="grid gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium">MCP connectors</h2>
          <p className="text-sm text-content-secondary">
            These external tools belong only to this agent and never inherit
            from Personal Ask AI.
          </p>
        </div>
        <AgentMcpConnections agent={agent} />
      </section>
    </div>
  )
}

function AgentTriggersSettings({
  state,
}: {
  state: ReturnType<typeof useAgentSettingsState>
}) {
  const {
    triggers,
    createTrigger,
    updateTrigger,
    removeTrigger,
    rotateWebhookSecret,
    triggerKind,
    setTriggerKind,
    triggerLabel,
    setTriggerLabel,
    triggerTarget,
    setTriggerTarget,
    databaseEvent,
    setDatabaseEvent,
    databasePropertyId,
    setDatabasePropertyId,
    scheduleCadence,
    setScheduleCadence,
    scheduleIntervalMinutes,
    setScheduleIntervalMinutes,
    revealedWebhookSecret,
    setRevealedWebhookSecret,
    addTrigger,
  } = state
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Triggers</h2>
        <p className="text-sm text-content-secondary">
          Manual runs are always available. Add schedules or supported workspace
          events here.
        </p>
      </div>
      {triggers.data?.triggers.map((trigger) => (
        <div
          className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm"
          key={trigger.id}
        >
          <span className="min-w-0 flex-1 truncate">{trigger.label}</span>
          <span className="text-xs capitalize text-content-secondary">
            {trigger.kind} · {trigger.status}
          </span>
          {trigger.kind === "webhook" ? (
            <Button
              aria-label={`Rotate secret for ${trigger.label}`}
              disabled={rotateWebhookSecret.isPending}
              onClick={() =>
                void rotateWebhookSecret
                  .mutateAsync({ triggerId: trigger.id })
                  .then(({ secret }) => setRevealedWebhookSecret(secret))
                  .catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not rotate webhook secret.",
                    ),
                  )
              }
              size="icon-sm"
              variant="ghost"
            >
              <KeyRoundIcon />
            </Button>
          ) : null}
          <Button
            disabled={updateTrigger.isPending}
            onClick={() =>
              void updateTrigger
                .mutateAsync({
                  config: trigger.config,
                  kind: trigger.kind,
                  label: trigger.label,
                  status: trigger.status === "active" ? "paused" : "active",
                  triggerId: trigger.id,
                })
                .catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not update trigger.",
                  ),
                )
            }
            size="sm"
            variant="ghost"
          >
            {trigger.status === "active" ? "Pause" : "Enable"}
          </Button>
          <Button
            aria-label={`Remove ${trigger.label}`}
            disabled={removeTrigger.isPending}
            onClick={() =>
              void removeTrigger
                .mutateAsync({ triggerId: trigger.id })
                .catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not remove trigger.",
                  ),
                )
            }
            size="icon-sm"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {revealedWebhookSecret ? (
        <div className="rounded-md bg-feedback-warning-background p-3 text-xs text-feedback-warning-text">
          Copy this webhook secret now. It will not be shown again.
          <Input
            className="mt-2 font-mono"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={revealedWebhookSecret}
          />
        </div>
      ) : null}
      <div className="grid gap-2 rounded-md bg-surface-secondary p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
        <Select
          onValueChange={(value) => {
            const kind = value as Exclude<CustomAgentTriggerKind, "manual">
            setTriggerKind(kind)
            setTriggerLabel(defaultTriggerLabel(kind))
            setTriggerTarget("")
          }}
          value={triggerKind}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="database">Database event</SelectItem>
            <SelectItem value="comment">Page comment</SelectItem>
            <SelectItem value="mention">Agent mention</SelectItem>
            <SelectItem value="meeting">Meeting completion</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem disabled value="slack">
              Slack event (adapter required)
            </SelectItem>
            <SelectItem disabled value="connector">
              Connector event (adapter required)
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="Trigger label"
          onChange={(event) => setTriggerLabel(event.target.value)}
          placeholder="Trigger name"
          value={triggerLabel}
        />
        <Button
          disabled={!triggerLabel.trim() || createTrigger.isPending}
          onClick={() => void addTrigger()}
        >
          Add trigger
        </Button>
        {triggerKind === "schedule" ? (
          <Select onValueChange={setScheduleCadence} value={scheduleCadence}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="custom">Custom interval</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {isCustomSchedule(triggerKind, scheduleCadence) ? (
          <Input
            aria-label="Schedule interval in minutes"
            className="sm:col-span-2"
            min={5}
            onChange={(event) => setScheduleIntervalMinutes(event.target.value)}
            placeholder="Interval in minutes"
            type="number"
            value={scheduleIntervalMinutes}
          />
        ) : triggerKind === "database" ? (
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <Input
              aria-label="Database ID"
              onChange={(event) => setTriggerTarget(event.target.value)}
              placeholder="Database ID"
              value={triggerTarget}
            />
            <Select
              onValueChange={(value) =>
                setDatabaseEvent(value as typeof databaseEvent)
              }
              value={databaseEvent}
            >
              <SelectTrigger aria-label="Database event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row_added">Row added</SelectItem>
                <SelectItem value="row_removed">Row removed</SelectItem>
                <SelectItem value="property_changed">
                  Property changed
                </SelectItem>
              </SelectContent>
            </Select>
            {databaseEvent === "property_changed" ? (
              <Input
                aria-label="Property ID filter"
                className="sm:col-span-2"
                onChange={(event) => setDatabasePropertyId(event.target.value)}
                placeholder="Property ID filter (optional)"
                value={databasePropertyId}
              />
            ) : null}
          </div>
        ) : needsTriggerTarget(triggerKind) ? (
          <Input
            className="sm:col-span-2"
            onChange={(event) => setTriggerTarget(event.target.value)}
            placeholder={triggerTargetPlaceholder(triggerKind)}
            value={triggerTarget}
          />
        ) : triggerKind === "webhook" ? (
          <span className="text-xs text-content-secondary sm:col-span-2">
            Create the trigger, then rotate its secret to reveal a signing key.
          </span>
        ) : null}
      </div>
    </section>
  )
}

function AgentVersionSettings({
  state,
}: {
  state: ReturnType<typeof useAgentSettingsState>
}) {
  const { revisions, revert } = state
  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-medium">Version history</h2>
      {revisions.data?.revisions.map((revision, index) => (
        <div
          className="flex items-center rounded-md bg-surface-secondary px-3 py-2 text-sm"
          key={revision.id}
        >
          <span>Revision {revision.version}</span>
          <span className="ml-2 text-content-secondary">
            {new Date(revision.createdAt).toLocaleString()}
          </span>
          {index > 0 ? (
            <Button
              className="ml-auto"
              onClick={() =>
                void revert.mutateAsync({ revisionId: revision.id })
              }
              size="sm"
              variant="ghost"
            >
              Revert
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  )
}

function buildTriggerConfig(input: {
  triggerKind: Exclude<CustomAgentTriggerKind, "manual">
  target: string
  scheduleCadence: string
  scheduleIntervalMinutes: string
  databaseEvent: string
  databasePropertyId: string
}): Record<string, unknown> {
  const {
    triggerKind,
    target,
    scheduleCadence,
    scheduleIntervalMinutes,
    databaseEvent,
    databasePropertyId,
  } = input
  if (triggerKind === "schedule") {
    if (scheduleCadence !== "custom") return { cadence: scheduleCadence }
    const intervalMinutes = Number(scheduleIntervalMinutes)
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5)
      throw new Error("Custom schedules must run at least 5 minutes apart.")
    return { cadence: scheduleCadence, intervalMinutes }
  }
  if (triggerKind === "database")
    return {
      databaseId: target,
      event: databaseEvent,
      ...(databaseEvent === "property_changed" && databasePropertyId.trim()
        ? { propertyId: databasePropertyId.trim() }
        : {}),
    }
  const targetKeys = {
    comment: "pageId",
    mention: "pageId",
    meeting: "meetingId",
    slack: "channelId",
    connector: "adapterId",
    webhook: null,
  } as const
  const key = targetKeys[triggerKind]
  return key ? { [key]: target } : {}
}

function needsTriggerTarget(
  kind: Exclude<CustomAgentTriggerKind, "manual">,
): kind is Exclude<CustomAgentTriggerKind, "manual" | "schedule" | "webhook"> {
  return !["schedule", "webhook"].includes(kind)
}

function isCustomSchedule(kind: CustomAgentTriggerKind, cadence: string) {
  return kind === "schedule" && cadence === "custom"
}

function defaultTriggerLabel(kind: Exclude<CustomAgentTriggerKind, "manual">) {
  return (
    {
      comment: "Page comment",
      connector: "Connector event",
      database: "Database changed",
      meeting: "Meeting completed",
      mention: "Agent mentioned",
      schedule: "Daily",
      slack: "Slack event",
      webhook: "Webhook",
    } as const
  )[kind]
}

function triggerTargetPlaceholder(
  kind: Exclude<CustomAgentTriggerKind, "manual" | "schedule" | "webhook">,
) {
  if (kind === "database") return "Database ID"
  if (kind === "comment" || kind === "mention") return "Page ID"
  if (kind === "meeting") return "Meeting ID"
  if (kind === "slack") return "Slack channel ID"
  return "Curated event adapter ID"
}

function normalizePanelTab(value: string | null): AgentPanelTab {
  if (
    value === "tools" ||
    value === "triggers" ||
    value === "activity" ||
    value === "share" ||
    value === "versions"
  )
    return value
  return "overview"
}
