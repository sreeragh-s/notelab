import * as React from "react"
import { useParams } from "@tanstack/react-router"
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
  useSubmitCustomAgentMessage,
  useStartCustomAgentRun,
  useUpdateCustomAgentTrigger,
  useUpdateAiAgentProfile,
  type CustomAgentTriggerKind,
} from "@zilobase/features/ai-chat"
import { toast } from "sonner"

import { AgentEditor } from "@/features/settings/pages/zilobase-ai/components/custom-agents-section"
import { BotIcon, KeyRoundIcon, Play, SendIcon, Trash2Icon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { Textarea } from "@/shared/ui/textarea"

type AgentPageTab = "chat" | "activity" | "settings"

export default function CustomAgentPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string }
  const agentQuery = useAiAgentProfile(agentId)
  const updateAgent = useUpdateAiAgentProfile(agentId)
  const [tab, setTab] = React.useState<AgentPageTab>("chat")
  const [name, setName] = React.useState("")

  React.useEffect(() => setName(agentQuery.data?.name ?? ""), [agentQuery.data?.name])

  const saveTitle = async () => {
    const next = name.trim() || "Untitled agent"
    if (!agentQuery.data || next === agentQuery.data.name) return
    try {
      await updateAgent.mutateAsync({ name: next })
    } catch (error) {
      setName(agentQuery.data.name)
      toast.error(error instanceof Error ? error.message : "Could not rename agent.")
    }
  }

  if (agentQuery.isLoading) return <div className="flex h-full items-center justify-center text-sm text-content-secondary">Loading agent…</div>
  if (!agentQuery.data) return <div className="flex h-full items-center justify-center text-sm text-content-secondary">Agent unavailable.</div>

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-surface-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-5 pb-12 pt-8 sm:px-8 md:px-16">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
            <BotIcon className="size-6" />
          </span>
          <Input
            aria-label="Agent title"
            autoFocus
            className="h-auto border-transparent bg-transparent px-1 py-1 font-heading text-3xl font-semibold shadow-none hover:bg-action-neutral-hover focus-visible:bg-control-background"
            disabled={agentQuery.data.role === "user"}
            maxLength={120}
            onBlur={() => void saveTitle()}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
            value={name}
          />
        </div>

        <Tabs className="min-h-0 flex-1 gap-5" onValueChange={(value) => setTab(value as AgentPageTab)} value={tab}>
          <TabsList aria-label="Custom Agent">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          {tab === "chat" ? <AgentChat agentId={agentId} /> : null}
          {tab === "activity" ? <AgentActivity agentId={agentId} /> : null}
          {tab === "settings" ? <AgentSettings agentId={agentId} /> : null}
        </Tabs>
      </div>
    </main>
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
      await submit.mutateAsync({ clientId: crypto.randomUUID(), message: value })
    } catch (error) {
      setMessage(value)
      toast.error(error instanceof Error ? error.message : "Could not send message.")
    }
  }
  const run = async () => {
    if (startRun.isPending) return
    const prompt = message.trim()
    try {
      await startRun.mutateAsync(prompt ? { prompt } : {})
      setMessage("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the agent run.")
    }
  }
  const messages = conversation.data?.messages ?? []
  return (
    <section className="flex min-h-[32rem] flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 py-4">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-lg bg-surface-secondary"><BotIcon className="size-6" /></span>
            <h2 className="font-heading text-xl font-medium">Build this agent through chat</h2>
            <p className="text-sm text-content-secondary">
              This agent currently has {resources.data?.resources.length ?? 0} granted resources and no implicit workspace access. Ask it to change its instructions, or run the saved configuration.
            </p>
          </div>
        ) : messages.map((item) => (
          <article className={item.role === "user" ? "ml-auto max-w-2xl rounded-lg bg-surface-secondary px-4 py-3" : "max-w-3xl py-2"} key={item.id}>
            {item.parts.map((part, index) => <MessagePart key={index} part={part} />)}
          </article>
        ))}
        {(legacyConversations.data?.conversations.length ?? 0) > 0 ? (
          <details className="mt-8 rounded-lg bg-surface-secondary p-4">
            <summary className="cursor-pointer text-sm font-medium">Your private legacy agent chats</summary>
            <p className="mt-1 text-xs text-content-secondary">These earlier Ask AI conversations remain private to you and are read-only.</p>
            <div className="mt-4 space-y-5">
              {legacyConversations.data?.conversations.map((legacy) => (
                <section className="space-y-2" key={legacy.id}>
                  <p className="text-xs text-content-secondary">{new Date(legacy.lastActivityAt).toLocaleString()}</p>
                  {legacy.messages.map((item) => (
                    <article className={item.role === "user" ? "ml-auto max-w-2xl rounded-lg bg-control-background px-3 py-2" : "max-w-3xl py-1"} key={item.id}>
                      {item.parts.map((part, index) => <MessagePart key={index} part={part} />)}
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
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() }
          }}
          placeholder="Describe how to configure the agent, ask it to run, or do both…"
          value={message}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <span className="text-xs text-content-secondary">Configuration changes create a reversible revision.</span>
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
            <Button aria-label="Send" disabled={!message.trim() || submit.isPending} onClick={() => void send()} size="icon" type="button">
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
    return <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-secondary p-3 text-xs">{JSON.stringify(value.definition, null, 2)}</pre>
  }
  return typeof value.text === "string" ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{value.text}</p> : null
}

function AgentActivity({ agentId }: { agentId: string }) {
  const runs = useCustomAgentRuns(agentId)
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-medium">Runs</h2>
      {(runs.data?.runs ?? []).length === 0 ? <p className="text-sm text-content-secondary">No runs yet.</p> : null}
      {runs.data?.runs.map((run) => (
        <div className="rounded-lg bg-surface-secondary p-4" key={run.id}>
          <div className="flex items-center gap-2"><Play className="size-4" /><strong className="text-sm capitalize">{run.status.replace("_", " ")}</strong><span className="ml-auto text-xs text-content-secondary">Revision {run.revisionId.slice(0, 8)}</span></div>
          {run.outputSummary ? <p className="mt-2 whitespace-pre-wrap text-sm">{run.outputSummary}</p> : null}
          {run.errorSummary ? <p className="mt-2 text-sm text-feedback-danger-text">{run.errorSummary}</p> : null}
        </div>
      ))}
    </section>
  )
}

function AgentSettings({ agentId }: { agentId: string }) {
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
  const [resourceType, setResourceType] = React.useState<"page" | "database">("page")
  const [resourceAccess, setResourceAccess] = React.useState<"view" | "comment" | "edit">("view")
  const [triggerKind, setTriggerKind] = React.useState<Exclude<CustomAgentTriggerKind, "manual">>("schedule")
  const [triggerLabel, setTriggerLabel] = React.useState("Daily")
  const [triggerTarget, setTriggerTarget] = React.useState("")
  const [databaseEvent, setDatabaseEvent] = React.useState<"row_added" | "row_removed" | "property_changed">("property_changed")
  const [databasePropertyId, setDatabasePropertyId] = React.useState("")
  const [scheduleCadence, setScheduleCadence] = React.useState("daily")
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = React.useState("60")
  const [revealedWebhookSecret, setRevealedWebhookSecret] = React.useState<string | null>(null)

  const addResource = async () => {
    const id = resourceId.trim()
    if (!id || grant.isPending) return
    try {
      await grant.mutateAsync({ accessLevel: resourceAccess, resourceId: id, resourceType })
      setResourceId("")
      toast.success("Agent resource access updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not grant resource access.")
    }
  }

  const addTrigger = async () => {
    const label = triggerLabel.trim()
    if (!label || createTrigger.isPending) return
    const target = triggerTarget.trim()
    if (triggerKind === "schedule" && scheduleCadence === "custom" && (!Number.isFinite(Number(scheduleIntervalMinutes)) || Number(scheduleIntervalMinutes) < 5)) {
      toast.error("Custom schedules must run at least 5 minutes apart.")
      return
    }
    const config: Record<string, unknown> = triggerKind === "schedule"
      ? {
          cadence: scheduleCadence,
          ...(scheduleCadence === "custom" ? { intervalMinutes: Number(scheduleIntervalMinutes) } : {}),
        }
      : triggerKind === "database"
        ? {
            databaseId: target,
            event: databaseEvent,
            ...(databaseEvent === "property_changed" && databasePropertyId.trim()
              ? { propertyId: databasePropertyId.trim() }
              : {}),
          }
        : triggerKind === "comment" || triggerKind === "mention"
          ? { pageId: target }
          : triggerKind === "meeting"
            ? { meetingId: target }
            : triggerKind === "slack"
              ? { channelId: target }
              : triggerKind === "connector"
                ? { adapterId: target }
                : {}
    if (triggerKind !== "schedule" && triggerKind !== "webhook" && !target) {
      toast.error("Enter the resource or adapter identifier for this trigger.")
      return
    }
    try {
      await createTrigger.mutateAsync({ config, kind: triggerKind, label })
      setTriggerTarget("")
      setDatabasePropertyId("")
      toast.success("Agent trigger added.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add trigger.")
    }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3"><h2 className="font-heading text-lg font-medium">Overview, instructions, connectors, and sharing</h2><AgentEditor agentId={agentId} plain showActivity={false} /></section>
      <section className="grid gap-3">
        <div><h2 className="font-heading text-lg font-medium">Resource access</h2><p className="text-sm text-content-secondary">Only explicitly granted resources are available to this agent.</p></div>
        {resources.data?.resources.map((resource) => (
          <div className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm" key={`${resource.resourceType}:${resource.resourceId}`}>
            <span className="min-w-0 flex-1 truncate">{resource.name}</span>
            <span className="text-xs capitalize text-content-secondary">{resource.resourceType} · {resource.accessLevel}</span>
            <Button
              aria-label={`Remove ${resource.name}`}
              disabled={removeResource.isPending}
              onClick={() => void removeResource.mutateAsync({ resourceId: resource.resourceId, resourceType: resource.resourceType }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not remove access."))}
              size="icon-sm"
              variant="ghost"
            ><Trash2Icon /></Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Select onValueChange={(value) => setResourceType(value as "page" | "database")} value={resourceType}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="page">Page</SelectItem><SelectItem value="database">Database</SelectItem></SelectContent>
          </Select>
          <Input className="min-w-48 flex-1" onChange={(event) => setResourceId(event.target.value)} placeholder={`${resourceType === "page" ? "Page" : "Database"} ID`} value={resourceId} />
          <Select onValueChange={(value) => setResourceAccess(value as "view" | "comment" | "edit")} value={resourceAccess}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="view">View</SelectItem>
              {resourceType === "page" ? <SelectItem value="comment">Comment</SelectItem> : null}
              <SelectItem value="edit">Edit</SelectItem>
            </SelectContent>
          </Select>
          <Button disabled={!resourceId.trim() || grant.isPending} onClick={() => void addResource()}>Grant access</Button>
        </div>
      </section>
      <section className="grid gap-3">
        <div><h2 className="font-heading text-lg font-medium">Triggers</h2><p className="text-sm text-content-secondary">Manual runs are always available. Add schedules or supported workspace events here.</p></div>
        {triggers.data?.triggers.map((trigger) => (
          <div className="flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm" key={trigger.id}>
            <span className="min-w-0 flex-1 truncate">{trigger.label}</span>
            <span className="text-xs capitalize text-content-secondary">{trigger.kind} · {trigger.status}</span>
            {trigger.kind === "webhook" ? (
              <Button
                aria-label={`Rotate secret for ${trigger.label}`}
                disabled={rotateWebhookSecret.isPending}
                onClick={() => void rotateWebhookSecret.mutateAsync({ triggerId: trigger.id }).then(({ secret }) => setRevealedWebhookSecret(secret)).catch((error) => toast.error(error instanceof Error ? error.message : "Could not rotate webhook secret."))}
                size="icon-sm"
                variant="ghost"
              ><KeyRoundIcon /></Button>
            ) : null}
            <Button
              disabled={updateTrigger.isPending}
              onClick={() => void updateTrigger.mutateAsync({ config: trigger.config, kind: trigger.kind, label: trigger.label, status: trigger.status === "active" ? "paused" : "active", triggerId: trigger.id }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not update trigger."))}
              size="sm"
              variant="ghost"
            >{trigger.status === "active" ? "Pause" : "Enable"}</Button>
            <Button
              aria-label={`Remove ${trigger.label}`}
              disabled={removeTrigger.isPending}
              onClick={() => void removeTrigger.mutateAsync({ triggerId: trigger.id }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not remove trigger."))}
              size="icon-sm"
              variant="ghost"
            ><Trash2Icon /></Button>
          </div>
        ))}
        {revealedWebhookSecret ? (
          <div className="rounded-md bg-feedback-warning-background p-3 text-xs text-feedback-warning-text">
            Copy this webhook secret now. It will not be shown again.
            <Input className="mt-2 font-mono" onFocus={(event) => event.currentTarget.select()} readOnly value={revealedWebhookSecret} />
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
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="schedule">Schedule</SelectItem>
              <SelectItem value="database">Database event</SelectItem>
              <SelectItem value="comment">Page comment</SelectItem>
              <SelectItem value="mention">Agent mention</SelectItem>
              <SelectItem value="meeting">Meeting completion</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem disabled value="slack">Slack event (adapter required)</SelectItem>
              <SelectItem disabled value="connector">Connector event (adapter required)</SelectItem>
            </SelectContent>
          </Select>
          <Input aria-label="Trigger label" onChange={(event) => setTriggerLabel(event.target.value)} placeholder="Trigger name" value={triggerLabel} />
          <Button disabled={!triggerLabel.trim() || createTrigger.isPending} onClick={() => void addTrigger()}>Add trigger</Button>
          {triggerKind === "schedule" ? (
            <Select onValueChange={setScheduleCadence} value={scheduleCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem><SelectItem value="custom">Custom interval</SelectItem></SelectContent>
            </Select>
          ) : null}
          {triggerKind === "schedule" && scheduleCadence === "custom" ? (
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
              <Select onValueChange={(value) => setDatabaseEvent(value as typeof databaseEvent)} value={databaseEvent}>
                <SelectTrigger aria-label="Database event"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="row_added">Row added</SelectItem>
                  <SelectItem value="row_removed">Row removed</SelectItem>
                  <SelectItem value="property_changed">Property changed</SelectItem>
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
          ) : triggerKind !== "schedule" && triggerKind !== "webhook" ? (
            <Input
              className="sm:col-span-2"
              onChange={(event) => setTriggerTarget(event.target.value)}
              placeholder={triggerTargetPlaceholder(triggerKind)}
              value={triggerTarget}
            />
          ) : triggerKind === "webhook" ? <span className="text-xs text-content-secondary sm:col-span-2">Create the trigger, then rotate its secret to reveal a signing key.</span> : null}
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="font-heading text-lg font-medium">Version history</h2>
        {revisions.data?.revisions.map((revision, index) => <div className="flex items-center rounded-md bg-surface-secondary px-3 py-2 text-sm" key={revision.id}><span>Revision {revision.version}</span><span className="ml-2 text-content-secondary">{new Date(revision.createdAt).toLocaleString()}</span>{index > 0 ? <Button className="ml-auto" onClick={() => void revert.mutateAsync({ revisionId: revision.id })} size="sm" variant="ghost">Revert</Button> : null}</div>)}
      </section>
    </div>
  )
}

function defaultTriggerLabel(kind: Exclude<CustomAgentTriggerKind, "manual">) {
  return ({
    comment: "Page comment",
    connector: "Connector event",
    database: "Database changed",
    meeting: "Meeting completed",
    mention: "Agent mentioned",
    schedule: "Daily",
    slack: "Slack event",
    webhook: "Webhook",
  } as const)[kind]
}

function triggerTargetPlaceholder(kind: Exclude<CustomAgentTriggerKind, "manual" | "schedule" | "webhook">) {
  if (kind === "database") return "Database ID"
  if (kind === "comment" || kind === "mention") return "Page ID"
  if (kind === "meeting") return "Meeting ID"
  if (kind === "slack") return "Slack channel ID"
  return "Curated event adapter ID"
}
