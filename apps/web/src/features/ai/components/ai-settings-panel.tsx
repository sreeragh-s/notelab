import * as React from "react"
import { toast } from "sonner"
import {
  useCreateAiAgentProfile,
  useMcpWorkspacePolicy,
  useWorkspaceAiModels,
} from "@zilobase/features/ai-chat"
import { useZilobaseAiPages } from "@zilobase/features/pages"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"

import { Button } from "@/shared/ui/button"
import { XIcon } from "@/shared/components/icons"
import { Input } from "@/shared/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import {
  AgentEditor,
  PersonalMcpActivity,
  PersonalMcpConnections,
  WorkspaceMcpPolicyPanel,
} from "@/features/settings/pages/zilobase-ai/components/custom-agents-section"
import { ZilobaseAiSection } from "@/features/settings/pages/zilobase-ai/components/zilobase-ai-section"

type PersonalTab =
  | "knowledge"
  | "connectors"
  | "activity"
  | "policy"

export function AiSettingsPanel({
  agentId,
  creatingAgent = false,
  initialTab,
  onAgentCreated,
  onClose,
  onExpandPage,
  scope,
  showCloseButton = true,
}: {
  agentId: string | null
  creatingAgent?: boolean
  initialTab?: string | null
  onAgentCreated?: (agentId: string) => void
  onClose: () => void
  onExpandPage?: (pageId: string) => void
  scope: "personal" | "agent"
  showCloseButton?: boolean
}) {
  const [personalTab, setPersonalTab] = React.useState<PersonalTab>(
    isPersonalTab(initialTab) ? initialTab : "knowledge",
  )

  React.useEffect(() => {
    if (isPersonalTab(initialTab)) setPersonalTab(initialTab)
  }, [initialTab])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-start gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-medium text-content-primary">
            {creatingAgent ? "Create agent" : scope === "agent" ? "Agent settings" : "Personal Ask AI"}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-content-secondary">
            {scope === "agent"
              ? "Configure this shared agent without exposing private conversations."
              : "Manage your private AI instructions, skills, and workspace-scoped connectors."}
          </p>
        </div>
        {showCloseButton ? (
          <Button aria-label="Close AI settings" onClick={onClose} size="icon-sm" type="button" variant="ghost">
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
        {creatingAgent ? (
          <CreateAgentForm onCreated={onAgentCreated} />
        ) : scope === "agent" ? (
          <AgentEditor agentId={agentId} initialTab={initialTab} plain />
        ) : (
          <PersonalSettings
            onExpandPage={onExpandPage}
            tab={personalTab}
            onTabChange={setPersonalTab}
          />
        )}
      </div>
    </div>
  )
}

function PersonalSettings({
  onExpandPage,
  onTabChange,
  tab,
}: {
  onExpandPage?: (pageId: string) => void
  onTabChange: (tab: PersonalTab) => void
  tab: PersonalTab
}) {
  const policyQuery = useMcpWorkspacePolicy()
  const tabs: Array<{ id: PersonalTab; label: string }> = [
    { id: "knowledge", label: "Instructions & Skills" },
    { id: "connectors", label: "Connectors" },
    { id: "activity", label: "Activity" },
    ...(policyQuery.data ? [{ id: "policy" as const, label: "Workspace Policy" }] : []),
  ]
  return (
    <Tabs className="gap-5" onValueChange={(value) => onTabChange(value as PersonalTab)} value={tab}>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList aria-label="Personal Ask AI settings">
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
        {tab === "knowledge" && <PersonalKnowledge onExpandPage={onExpandPage} />}
        {tab === "connectors" && <PersonalMcpConnections />}
        {tab === "activity" && <PersonalMcpActivity />}
        {tab === "policy" && <WorkspaceMcpPolicyPanel />}
      </div>
    </Tabs>
  )
}

function PersonalKnowledge({ onExpandPage }: { onExpandPage?: (pageId: string) => void }) {
  const workspaceId = useActiveWorkspaceId()
  const { data: aiPages = [], isLoading } = useZilobaseAiPages(workspaceId)
  return (
    <div className="grid gap-6">
      <ZilobaseAiSection
        isLoading={isLoading}
        items={aiPages.filter((page) => page.metadata.zilobaseai === "instruction")}
        mode="instruction"
        onExpandPage={onExpandPage}
        workspaceId={workspaceId ?? null}
      />
      <ZilobaseAiSection
        isLoading={isLoading}
        items={aiPages.filter((page) => page.metadata.zilobaseai === "skill")}
        mode="skill"
        onExpandPage={onExpandPage}
        workspaceId={workspaceId ?? null}
      />
    </div>
  )
}

function CreateAgentForm({ onCreated }: { onCreated?: (agentId: string) => void }) {
  const createAgent = useCreateAiAgentProfile()
  const modelsQuery = useWorkspaceAiModels()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [defaultModel, setDefaultModel] = React.useState("auto")

  const create = async () => {
    try {
      const result = await createAgent.mutateAsync({
        defaultModel,
        description: description.trim(),
        instructions,
        name: name.trim(),
      })
      toast.success("Custom Agent created.")
      onCreated?.(result.agent.id)
    } catch (error) {
      toast.error("Could not create agent", {
        description: error instanceof Error ? error.message : "Try again.",
      })
    }
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Name</span>
        <Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Description</span>
        <Input maxLength={500} onChange={(event) => setDescription(event.target.value)} value={description} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Instructions</span>
        <Textarea className="min-h-40" maxLength={20_000} onChange={(event) => setInstructions(event.target.value)} value={instructions} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Default model</span>
        <Select onValueChange={setDefaultModel} value={defaultModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            {modelsQuery.data?.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className="text-xs text-content-secondary">New agents are private until you share them.</p>
      <Button disabled={!name.trim() || createAgent.isPending} onClick={() => void create()} type="button">
        {createAgent.isPending ? "Creating…" : "Create agent"}
      </Button>
    </div>
  )
}

function isPersonalTab(value?: string | null): value is PersonalTab {
  return value === "knowledge" || value === "connectors" || value === "activity" || value === "policy"
}
