"use client"

import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { useAiAgentProfiles } from "@zilobase/features/ai-chat"
import { useRouter, useRouterState } from "@tanstack/react-router"

import {
  ChevronsRightIcon,
  PictureInPicture2Icon,
  PlusIcon,
  SidebarSimpleIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { AiChatHistoryList } from "./elements/ai-chat-history-list"
import { AiSettingsPanel } from "./ai-settings-panel"
import { useAiChatThreadState } from "../conversation/use-ai-chat-thread-state"
import type { ChatPresentationMode } from "./chat-sidebar"
import { PageSidePaneLayout } from "@/features/pages/context"

const Chatbot = lazy(() => import("./elements/chatbot"))

type WorkspacePanel = "history" | "settings" | null

export function AgentChatWorkspace({
  databaseId,
  externalSidePane = null,
  externalSidePaneOpen = false,
  externalSidePaneVisible = false,
  isSidebar = false,
  onClose,
  onPresentationModeChange,
  open = true,
  pageId,
  presentationMode = "sidebar",
}: {
  databaseId?: string | null
  externalSidePane?: ReactNode | null
  externalSidePaneOpen?: boolean
  externalSidePaneVisible?: boolean
  isSidebar?: boolean
  onClose?: () => void
  onPresentationModeChange?: (mode: ChatPresentationMode) => void
  open?: boolean
  pageId?: string | null
  presentationMode?: ChatPresentationMode
}) {
  const router = useRouter()
  const routeSearch = useRouterState({
    select: (state) => state.location.searchStr,
  })
  const {
    activeThreadId,
    draftAgentProfileId,
    isBootstrapping,
    setActiveThreadId,
    setDraftAgentProfileId,
    threadsQuery,
  } = useAiChatThreadState({ enabled: open })
  const profilesQuery = useAiAgentProfiles({ enabled: open })
  const profiles = profilesQuery.data?.filter((agent) => agent.status === "active") ?? []
  const activeThread = threadsQuery.data?.threads.find((thread) => thread.id === activeThreadId)
  const selectedAgentId = activeThread?.agentProfileId ?? draftAgentProfileId
  const selectedAgent = profiles.find((agent) => agent.id === selectedAgentId)
  const [draftDirty, setDraftDirty] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [panel, setPanelState] = useState<WorkspacePanel>(() => readInitialPanel(isSidebar))
  const [settingsTab, setSettingsTab] = useState<string | null>(() => readSearchParam("settingsTab"))

  const setPanel = useCallback((next: WorkspacePanel) => {
    setPanelState(next)
    if (!isSidebar) {
      updatePanelSearch(next, selectedAgentId, settingsTab, router.history.replace)
    }
  }, [isSidebar, router.history, selectedAgentId, settingsTab])

  useEffect(() => {
    if (!isSidebar && panel) {
      updatePanelSearch(panel, selectedAgentId, settingsTab, router.history.replace)
    }
  }, [isSidebar, panel, router.history, selectedAgentId, settingsTab])

  useEffect(() => {
    if (isSidebar) return
    setPanelState(readPanelFromSearch(routeSearch))
  }, [isSidebar, routeSearch])

  useEffect(() => {
    if (isSidebar) return
    const result = readSearchParam("mcp")
    if (result === "connected") toast.success("MCP connection completed. Review and enable its tools.")
    if (result === "failed") toast.error("MCP connection failed. Try reconnecting.")
    if (result) clearSearchParams("mcp")
  }, [isSidebar])

  const switchAgent = useCallback((agentId: string | null) => {
    if (agentId === selectedAgentId && !activeThreadId) return
    if (draftDirty && !window.confirm("Switch agents and discard this unsent prompt and its attachments?")) return
    setDraftDirty(false)
    setDraftAgentProfileId(agentId)
  }, [activeThreadId, draftDirty, selectedAgentId, setDraftAgentProfileId])

  const selectThread = useCallback((threadId: string | null) => {
    if (draftDirty && !window.confirm("Open this chat and discard the unsent prompt and its attachments?")) return
    setDraftDirty(false)
    setActiveThreadId(threadId)
    setPanel(null)
  }, [draftDirty, setActiveThreadId, setPanel])

  const openSettings = useCallback(() => {
    setCreatingAgent(false)
    setSettingsTab(selectedAgentId ? "instructions" : "preferences")
    setPanel("settings")
  }, [selectedAgentId, setPanel])

  const addAgent = useCallback(() => {
    setCreatingAgent(true)
    setPanel("settings")
  }, [setPanel])

  const chat = isBootstrapping ? (
    <LoadingChat />
  ) : (
    <Suspense fallback={<LoadingChat />}>
      <Chatbot
        databaseId={databaseId}
        draftAgentDescription={selectedAgent?.description ?? null}
        draftAgentName={selectedAgent?.name ?? null}
        draftAgentProfileId={selectedAgentId}
        isSidebar={isSidebar}
        key={`${activeThreadId ?? "draft"}:${selectedAgentId ?? "personal"}`}
        onDraftDirtyChange={setDraftDirty}
        onThreadCreated={setActiveThreadId}
        pageId={pageId}
        threadId={activeThreadId}
      />
    </Suspense>
  )

  const settingsPanel = (
    <AiSettingsPanel
      agentId={selectedAgentId}
      creatingAgent={creatingAgent}
      initialTab={settingsTab}
      onAgentCreated={(agentId) => {
        setCreatingAgent(false)
        switchAgent(agentId)
        setSettingsTab("instructions")
      }}
      onClose={() => setPanel(null)}
      scope={selectedAgentId || creatingAgent ? "agent" : "personal"}
      showCloseButton={isSidebar}
    />
  )
  const historyPanel = (
    <HistoryPanel
      activeThreadId={activeThreadId}
      onClose={() => setPanel(null)}
      onSelectThread={selectThread}
    />
  )
  const main = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas">
      {isSidebar ? (
        <ChatHeader
          onClose={onClose}
          onPresentationModeChange={onPresentationModeChange}
          presentationMode={presentationMode}
        />
      ) : null}
      <AgentRail
        compact={isSidebar}
        onAddAgent={addAgent}
        onSelect={switchAgent}
        onSettings={openSettings}
        profiles={profiles}
        selectedAgentId={selectedAgentId}
      />
      <div
        className={isSidebar
          ? panel === "settings"
            ? "min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto px-4 py-4"
          : "min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6"}
        data-ai-scroll-shell
      >
        {isSidebar && panel === "history" ? (
          <AiChatHistoryList
            activeThreadId={activeThreadId}
            className="[&_[data-sidebar=menu-button]]:h-7 [&_[data-sidebar=menu-button]]:p-1.5 [&_[data-sidebar=menu]]:gap-px"
            onSelectThread={selectThread}
          />
        ) : isSidebar && panel === "settings" ? (
          settingsPanel
        ) : chat}
      </div>
    </div>
  )

  if (isSidebar) return main

  const aiSidePane = panel === "settings" ? settingsPanel : panel === "history" ? historyPanel : null
  return (
    <PageSidePaneLayout
      main={main}
      mainScrollClassName="overscroll-y-none"
      sidePane={aiSidePane ?? externalSidePane}
      sidePaneOpen={Boolean(aiSidePane) || externalSidePaneOpen}
      sidePaneVisible={Boolean(aiSidePane) || externalSidePaneVisible}
    />
  )
}

function ChatHeader({
  onClose,
  onPresentationModeChange,
  presentationMode,
}: {
  onClose?: () => void
  onPresentationModeChange?: (mode: ChatPresentationMode) => void
  presentationMode: ChatPresentationMode
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      {onClose ? (
        <Button aria-label="Close Ask AI" onClick={onClose} size="icon-sm" type="button" variant="ghost">
          {presentationMode === "floating" ? <XIcon /> : <ChevronsRightIcon />}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-sm font-medium">Ask AI</h2>
      </div>
      {onPresentationModeChange ? (
        <Button
          aria-label={presentationMode === "sidebar" ? "Switch to floating chat" : "Dock chat in sidebar"}
          onClick={() => onPresentationModeChange(presentationMode === "sidebar" ? "floating" : "sidebar")}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {presentationMode === "sidebar" ? <PictureInPicture2Icon className="size-4" /> : <SidebarSimpleIcon className="size-4" mirrored />}
        </Button>
      ) : null}
    </header>
  )
}

function AgentRail({
  compact,
  onAddAgent,
  onSelect,
  onSettings,
  profiles,
  selectedAgentId,
}: {
  compact: boolean
  onAddAgent: () => void
  onSelect: (agentId: string | null) => void
  onSettings: () => void
  profiles: Array<{ id: string; name: string }>
  selectedAgentId: string | null
}) {
  return (
    <Tabs
      className="block shrink-0 px-3 py-2"
      onValueChange={(value) => onSelect(value === "personal" ? null : value)}
      value={selectedAgentId ?? "personal"}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList aria-label="Ask AI agents" className="w-max min-w-0 justify-start">
            <AgentTab compact={compact} label="Personal Ask AI" value="personal" />
            {profiles.map((agent) => (
              <AgentTab compact={compact} key={agent.id} label={agent.name} value={agent.id} />
            ))}
          </TabsList>
        </div>
        <Button
          aria-label="Ask AI settings"
          onClick={onSettings}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <SlidersHorizontalIcon className="size-4" />
        </Button>
        <Button className="database-new-button shrink-0" onClick={onAddAgent} type="button">
          <PlusIcon className="size-4" />
          Add Agent
        </Button>
      </div>
    </Tabs>
  )
}

function AgentTab({ compact, label, value }: { compact: boolean; label: string; value: string }) {
  return (
    <TabsTrigger
      className="h-8 shrink-0 grow-0 gap-2 px-3"
      title={compact ? label : undefined}
      value={value}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-surface-secondary text-[10px] font-semibold">
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span className={compact ? "max-w-28 truncate" : "max-w-40 truncate"}>{label}</span>
    </TabsTrigger>
  )
}

function HistoryPanel({ activeThreadId, onClose, onSelectThread }: {
  activeThreadId: string | null
  onClose: () => void
  onSelectThread: (threadId: string | null) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-12 items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-medium">Chat history</h2>
          <p className="mt-0.5 text-xs text-content-secondary">Your private Personal Ask AI and custom-agent conversations.</p>
        </div>
        <Button aria-label="Close chat history" onClick={onClose} size="icon-sm" type="button" variant="ghost">
          <XIcon className="size-4" />
        </Button>
      </header>
      <AiChatHistoryList activeThreadId={activeThreadId} className="min-h-0 flex-1 overflow-y-auto p-3" onSelectThread={onSelectThread} />
    </div>
  )
}

function LoadingChat() {
  return <div className="flex h-full min-h-40 items-center justify-center text-sm text-content-secondary">Loading chat…</div>
}

function readInitialPanel(isSidebar: boolean): WorkspacePanel {
  if (isSidebar || typeof window === "undefined") return null
  return readPanelFromSearch(window.location.search)
}

function readPanelFromSearch(search: string): WorkspacePanel {
  const value = new URLSearchParams(search).get("panel")
  return value === "history" || value === "settings" ? value : null
}

function readSearchParam(name: string) {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name)
}

function updatePanelSearch(
  panel: WorkspacePanel,
  agentId: string | null,
  settingsTab: string | null,
  replace: (path: string) => void,
) {
  if (typeof window === "undefined" || window.location.pathname !== "/ai") return
  const url = new URL(window.location.href)
  if (panel) url.searchParams.set("panel", panel)
  else url.searchParams.delete("panel")
  if (panel === "settings") {
    url.searchParams.set("settingsScope", agentId ? "agent" : "personal")
    if (settingsTab) url.searchParams.set("settingsTab", settingsTab)
  } else {
    url.searchParams.delete("settingsScope")
    url.searchParams.delete("settingsTab")
  }
  replace(`${url.pathname}${url.search}${url.hash}`)
}

function clearSearchParams(...names: string[]) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  for (const name of names) url.searchParams.delete(name)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}
