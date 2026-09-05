import {
  getDatabaseId,
  MainPaneHeaderLeadingControl,
  PagePaneHeader,
  PageSidePaneCollapseButton,
} from "@/features/pages/components"
import { PageSidePaneHeaderCell, useOptionalPageLayoutSidebar } from "@/features/pages/context"

export function AppHeader({
  auxiliarySidePaneCloseLabel = "Close AI settings",
  auxiliarySidePaneOpen = false,
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
  auxiliarySidePaneCloseLabel?: string
  auxiliarySidePaneOpen?: boolean
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
          className="min-w-0 flex-1"
          discussionsOpen={discussionsOpen}
          leadingControl={<MainPaneHeaderLeadingControl />}
          onToggleDiscussions={onToggleDiscussions}
          onTogglePageSidebar={onTogglePageSidebar}
          pageSidebarOpen={pageSidebarOpen}
          pathname={pathname}
          showActions={!isSettingsPage}
        />
      </PageSidePaneHeaderCell>
      {showSidePaneHeader ? (
        <PageSidePaneHeaderCell side="side" splitActive={splitActive}>
          {showItemSidePaneHeader ? (
            <PagePaneHeader
              className="min-w-0 flex-1"
              onClose={onCloseSidePane}
              onTogglePageSidebar={renderedSidePanePageId && sidePaneHasLayoutSidebar
                ? () => pageLayoutSidebar?.toggleOverlay(renderedSidePanePageId)
                : undefined}
              pageSidebarOpen={pageLayoutSidebar?.overlayPageId === renderedSidePanePageId}
              pathname={sidePanePathname}
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
