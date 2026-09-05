"use client"

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  ChevronsRightIcon,
  PictureInPicture2Icon,
  SidebarSimpleIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { PageSidePaneLayout } from "@/features/pages/context"
import { PageEditorPane } from "@/features/pages/pages"
import { PageWorkspaceGate } from "@/features/workspaces"

import { useAiChatThreadState } from "../conversation/use-ai-chat-thread-state"
import type { ChatPresentationMode } from "./chat-sidebar"
import { AiSettingsPanel } from "./ai-settings-panel"
import type { PendingInitialChatSubmission } from "./elements/chatbot"

const Chatbot = lazy(() => import("./elements/chatbot"))

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
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  })
  const routeSearch = useMemo(() => new URLSearchParams(searchStr), [searchStr])
  const { activeThreadId, isBootstrapping, setActiveThreadId } =
    useAiChatThreadState({ enabled: open })
  const [, setDraftDirty] = useState(false)
  const [pendingInitialSubmission, setPendingInitialSubmission] =
    useState<PendingInitialChatSubmission | null>(null)
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false)
  const settingsOpen = isSidebar
    ? sidebarSettingsOpen
    : routeSearch.get("panel") === "settings"
  const { settingsTab, expandedSettingsPageId } = settingsLocation(
    routeSearch,
    isSidebar,
  )

  const setSettings = useCallback(
    (next: boolean) => {
      if (isSidebar) {
        setSidebarSettingsOpen(next)
        return
      }
      updateSettingsSearch(router, next, settingsTab)
    },
    [isSidebar, router, settingsTab],
  )

  const setExpandedSettingsPage = useCallback(
    (pageId: string | null) => {
      if (isSidebar) return
      const search = new URLSearchParams(searchStr)
      if (pageId) search.set("settingsPage", pageId)
      else search.delete("settingsPage")
      const query = search.toString()
      router.history.replace(`/ai${query ? `?${query}` : ""}`)
    },
    [isSidebar, router.history, searchStr],
  )

  useEffect(() => {
    if (isSidebar) return
    const result = readSearchParam("mcp")
    if (result === "connected")
      toast.success("MCP connection completed. Review and enable its tools.")
    if (result === "failed")
      toast.error("MCP connection failed. Try reconnecting.")
    if (result) clearSearchParams("mcp")
  }, [isSidebar])

  const chat = isBootstrapping ? (
    <LoadingChat />
  ) : (
    <Suspense fallback={<LoadingChat />}>
      <Chatbot
        databaseId={databaseId}
        isSidebar={isSidebar}
        key={activeThreadId ?? "personal-draft"}
        onDraftDirtyChange={setDraftDirty}
        onInitialSubmissionConsumed={() => setPendingInitialSubmission(null)}
        onInitialSubmissionPrepared={(submission) => {
          setPendingInitialSubmission(submission)
          setActiveThreadId(submission.threadId)
        }}
        onThreadCreated={setActiveThreadId}
        pageId={pageId}
        pendingInitialSubmission={pendingInitialSubmission}
        threadId={activeThreadId}
      />
    </Suspense>
  )

  function renderSettingsPanel() {
    return expandedSettingsPageId ? (
      <PageWorkspaceGate pageId={expandedSettingsPageId}>
        <PageEditorPane
          className="min-h-0 flex-1 overflow-y-auto"
          enableComments={false}
          key={expandedSettingsPageId}
          layoutPanelMode="overlay"
          onOpenPage={setExpandedSettingsPage}
          pageId={expandedSettingsPageId}
        />
      </PageWorkspaceGate>
    ) : (
      <AiSettingsPanel
        initialTab={settingsTab}
        onClose={() => setSettings(false)}
        onExpandPage={isSidebar ? undefined : setExpandedSettingsPage}
        showCloseButton={isSidebar}
      />
    )
  }
  const settingsPanel = renderSettingsPanel()
  function renderMain() {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-canvas">
        {isSidebar ? (
          <ChatHeader
            onClose={onClose}
            onPresentationModeChange={onPresentationModeChange}
            presentationMode={presentationMode}
          />
        ) : null}
        <div className="flex shrink-0 justify-end px-3 py-2">
          <Button
            aria-label="Ask AI settings"
            onClick={() => setSettings(!settingsOpen)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontalIcon className="size-4" />
          </Button>
        </div>
        <div
          className={
            isSidebar && settingsOpen
              ? "min-h-0 flex-1 overflow-hidden"
              : isSidebar
                ? "min-h-0 flex-1 overflow-y-auto px-4 py-4"
                : "min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-6"
          }
          data-ai-scroll-shell
        >
          {isSidebar && settingsOpen ? settingsPanel : chat}
        </div>
      </div>
    )
  }
  const main = renderMain()
  if (isSidebar) return main
  return (
    <PageSidePaneLayout
      main={main}
      mainScrollClassName="overscroll-y-none"
      sidePane={settingsOpen ? settingsPanel : externalSidePane}
      sidePaneOpen={settingsOpen || externalSidePaneOpen}
      sidePaneVisible={settingsOpen || externalSidePaneVisible}
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
        <Button
          aria-label="Close Ask AI"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {presentationMode === "floating" ? <XIcon /> : <ChevronsRightIcon />}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-sm font-medium">Ask AI</h2>
      </div>
      {onPresentationModeChange ? (
        <Button
          aria-label={
            presentationMode === "sidebar"
              ? "Switch to floating chat"
              : "Dock chat in sidebar"
          }
          onClick={() =>
            onPresentationModeChange(
              presentationMode === "sidebar" ? "floating" : "sidebar",
            )
          }
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {presentationMode === "sidebar" ? (
            <PictureInPicture2Icon className="size-4" />
          ) : (
            <SidebarSimpleIcon className="size-4" mirrored />
          )}
        </Button>
      ) : null}
    </header>
  )
}

function settingsLocation(search: URLSearchParams, isSidebar: boolean) {
  if (isSidebar) return { settingsTab: null, expandedSettingsPageId: null }
  return {
    settingsTab: search.get("settingsTab"),
    expandedSettingsPageId: search.get("settingsPage"),
  }
}

function LoadingChat() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-sm text-content-secondary">
      Loading chat…
    </div>
  )
}

function readSearchParam(name: string) {
  return typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get(name)
}

function updateSettingsSearch(
  router: ReturnType<typeof useRouter>,
  open: boolean,
  settingsTab: string | null,
) {
  if (typeof window === "undefined" || window.location.pathname !== "/ai")
    return
  const url = new URL(window.location.href)
  if (open) {
    url.searchParams.set("panel", "settings")
    url.searchParams.set("settingsScope", "personal")
    url.searchParams.delete("p")
    url.searchParams.delete("d")
    if (settingsTab) url.searchParams.set("settingsTab", settingsTab)
  } else {
    url.searchParams.delete("panel")
    url.searchParams.delete("settingsScope")
    url.searchParams.delete("settingsTab")
    url.searchParams.delete("settingsPage")
  }
  router.history.replace(`${url.pathname}${url.search}${url.hash}`)
}

function clearSearchParams(...names: string[]) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  for (const name of names) url.searchParams.delete(name)
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  )
}
