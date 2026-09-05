import { lazy, Suspense } from "react"

import {
  getDatabaseId,
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
  PageSidePaneCollapseButton,
} from "@/features/pages/components"
import { PageSidePaneHeaderCell, useOptionalPageLayoutSidebar } from "@/features/pages/context"

const CustomAgentHeaderActions = lazy(() =>
  import("@/features/ai/components/custom-agent-header-actions").then((module) => ({
    default: module.CustomAgentHeaderActions,
  })),
)

export function AppHeader({
  agentId,
  auxiliarySidePaneCloseLabel = "Close AI settings",
  auxiliarySidePaneOpen = false,
  auxiliarySidePanePageId,
  discussionsOpen,
  isSettingsPage,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  onCloseAuxiliarySidePane,
  onCloseSidePane,
  pathname,
  renderedSidePaneDatabaseId,
  renderedSidePanePageId,
  sidePaneAnimatedOpen,
  sidePaneDatabaseId,
}: {
  agentId?: string | null
  auxiliarySidePaneCloseLabel?: string
  auxiliarySidePaneOpen?: boolean
  auxiliarySidePanePageId?: string | null
  discussionsOpen: boolean
  isSettingsPage: boolean
  onToggleDiscussions?: () => void
  onTogglePageSidebar?: () => void
  pageSidebarOpen?: boolean
  onCloseAuxiliarySidePane?: () => void
  onCloseSidePane: () => void
  pathname: string
  renderedSidePaneDatabaseId: string | null
  renderedSidePanePageId: string | null
  sidePaneAnimatedOpen: boolean
  sidePaneDatabaseId: string | null
}) {
  const pageLayoutSidebar = useOptionalPageLayoutSidebar()
  const showItemSidePaneHeader = Boolean(renderedSidePanePageId || renderedSidePaneDatabaseId)
  const showSidePaneHeader = auxiliarySidePaneOpen || showItemSidePaneHeader
  const splitActive = showSidePaneHeader && sidePaneAnimatedOpen
  const sidePanePathname = renderedSidePaneDatabaseId
    ? `/d/${encodeURIComponent(renderedSidePaneDatabaseId)}`
    : `/p/${encodeURIComponent(renderedSidePanePageId ?? "")}`
  const routeDatabaseId = getDatabaseId(pathname)
  const rowNavigationDatabaseId = renderedSidePanePageId ? (sidePaneDatabaseId ?? routeDatabaseId) : null
  const sidePaneHasLayoutSidebar = pageLayoutSidebar?.hasOverlaySidebar(renderedSidePanePageId) ?? false

  return (
    <>
      <PageSidePaneHeaderCell className="z-10" side="main" splitActive={splitActive}>
        <PagePaneHeader
          actions={agentId ? (
            <Suspense fallback={null}>
              <CustomAgentHeaderActions agentId={agentId} />
            </Suspense>
          ) : undefined}
          className="min-w-0 flex-1"
          discussionsOpen={discussionsOpen}
          leadingControl={<MainPaneHeaderLeadingControl />}
          onToggleDiscussions={onToggleDiscussions}
          onTogglePageSidebar={onTogglePageSidebar}
          pageSidebarOpen={pageSidebarOpen}
          pathname={pathname}
          showActions={!isSettingsPage || Boolean(agentId)}
        />
      </PageSidePaneHeaderCell>
      {showSidePaneHeader ? (
        <PageSidePaneHeaderCell side="side" splitActive={splitActive}>
          {showItemSidePaneHeader || auxiliarySidePanePageId ? (
            <PagePaneHeader
              className="min-w-0 flex-1"
              onClose={auxiliarySidePanePageId ? onCloseAuxiliarySidePane : onCloseSidePane}
              onTogglePageSidebar={renderedSidePanePageId && sidePaneHasLayoutSidebar
                ? () => pageLayoutSidebar?.toggleOverlay(renderedSidePanePageId)
                : undefined}
              pageSidebarOpen={pageLayoutSidebar?.overlayPageId === renderedSidePanePageId}
              pathname={auxiliarySidePanePageId
                ? `/p/${encodeURIComponent(auxiliarySidePanePageId)}`
                : sidePanePathname}
              rowNavigationDatabaseId={rowNavigationDatabaseId}
              showBreadcrumb={false}
            />
          ) : onCloseAuxiliarySidePane ? (
            <div className="flex h-full items-center px-3">
              <PageSidePaneCollapseButton
                label={auxiliarySidePaneCloseLabel}
                onClick={onCloseAuxiliarySidePane}
              />
            </div>
          ) : null}
        </PageSidePaneHeaderCell>
      ) : null}
    </>
  )
}
