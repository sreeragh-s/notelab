import * as React from "react"
import { Loader2Icon, Maximize2, XIcon } from "@/shared/components/icons"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"
import { getApiErrorMessage } from "@/features/desktop/network/api"
import { PageEditorPane } from "@/features/pages/pages/index"
import { PageWorkspaceGate } from "@/features/workspaces"
import { useZilobaseFeatures } from "@zilobase/features"
import {
  useUpdatePage,
  pageQueryKey,
  type ZilobaseAiMode,
  type ZilobaseAiPageSummary,
  type Page,
  type PageMetadata,
} from "@zilobase/features/pages"

const modeLabels: Record<ZilobaseAiMode, string> = {
  instruction: "instruction",
  skill: "skill",
}

export function ZilobaseAiItem({
  mode,
  onExpandPage,
  page,
}: {
  mode: ZilobaseAiMode
  onExpandPage?: (pageId: string) => void
  page: ZilobaseAiPageSummary
}) {
  const { apiFetch, queryClient } = useZilobaseFeatures()
  const updatePage = useUpdatePage()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const isRemoving = updatePage.isPending

  const remove = async () => {
    let metadata: PageMetadata = {}

    const cached = queryClient.getQueryData<Page | null>(
      pageQueryKey(page.id),
    )

    if (cached?.metadata) {
      metadata = cached.metadata
    } else {
      const result = await apiFetch<{ page: Page }>(
        `/pages/${page.id}`,
        { method: "GET" },
      )
      metadata = result.page.metadata ?? {}
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...metadata,
          zilobaseai: null,
        },
      },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          toast.success(`Removed as ${modeLabels[mode]}.`)
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error))
        },
      },
    )
  }

  return (
    <>
      <div className="relative min-h-72 overflow-hidden bg-surface-canvas dark:bg-surface-navigation">
        <div className="absolute right-3 top-3 z-[80] flex items-center gap-1 rounded-md bg-surface-canvas p-0.5 dark:bg-surface-navigation">
          {onExpandPage ? (
            <Button
              aria-label={`Expand ${page.name || modeLabels[mode]}`}
              onClick={() => onExpandPage(page.id)}
              size="icon-sm"
              title="Expand page"
              type="button"
              variant="ghost"
            >
              <Maximize2 />
            </Button>
          ) : null}
          <Button
            aria-label={`Remove as ${modeLabels[mode]}`}
            className="text-content-secondary hover:text-content-primary"
            disabled={isRemoving}
            onClick={() => setConfirmOpen(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isRemoving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <XIcon />
            )}
          </Button>
        </div>
        <div className="max-h-[32rem] min-h-72 overflow-y-auto">
          <PageWorkspaceGate pageId={page.id}>
            <PageEditorPane
              className="min-h-72"
              enableComments={false}
              key={page.id}
              layoutPanelMode="overlay"
              onOpenPage={(pageId) => onExpandPage?.(pageId)}
              pageId={page.id}
              showCollaborationPresence={false}
            />
          </PageWorkspaceGate>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {modeLabels[mode]}</AlertDialogTitle>
            <AlertDialogDescription>
              Remove as {modeLabels[mode]}? This page will become a normal
              page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} variant="destructive">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ZilobaseAiItemList({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3">{children}</div>
  )
}
