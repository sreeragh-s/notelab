import { useMcpWorkspacePolicy } from "@zilobase/features/ai-chat"
import { useZilobaseAiPages } from "@zilobase/features/pages"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import * as React from "react"

import { PersonalMcpActivity, PersonalMcpConnections } from "@/features/ai/components/settings/mcp-connections"
import { WorkspaceMcpPolicyPanel } from "@/features/ai/components/settings/workspace-mcp-policy"
import { ZilobaseAiSection } from "@/features/ai/components/settings/zilobase-ai-section"
import { XIcon } from "@/shared/components/icons"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { Button } from "@/shared/ui/button"

type PersonalTab =
  | "knowledge"
  | "connectors"
  | "activity"
  | "policy"

export function AiSettingsPanel({
  initialTab,
  onClose,
  onExpandPage,
  showCloseButton = true,
}: {
  initialTab?: string | null
  onClose: () => void
  onExpandPage?: (pageId: string) => void
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
            Personal Ask AI
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-content-secondary">
            Manage your private AI instructions, skills, and workspace-scoped connectors.
          </p>
        </div>
        {showCloseButton ? (
          <Button aria-label="Close AI settings" onClick={onClose} size="icon-sm" type="button" variant="ghost">
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
        <PersonalSettings
          onExpandPage={onExpandPage}
          tab={personalTab}
          onTabChange={setPersonalTab}
        />
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

function isPersonalTab(value?: string | null): value is PersonalTab {
  return value === "knowledge" || value === "connectors" || value === "activity" || value === "policy"
}
