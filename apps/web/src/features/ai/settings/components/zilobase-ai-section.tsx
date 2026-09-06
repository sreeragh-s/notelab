import { BookOpenIcon, WandSparklesIcon } from "@/shared/components/icons"
import * as React from "react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty"
import { Skeleton } from "@/shared/ui/skeleton"
import type {
  ZilobaseAiMode,
  ZilobaseAiPageSummary,
} from "@zilobase/features/pages"

import { ZilobaseAiCreateMenu } from "./zilobase-ai-create-menu"
import { ZilobaseAiItem, ZilobaseAiItemList } from "./zilobase-ai-item"

const sectionConfig: Record<
  ZilobaseAiMode,
  {
    description: string
    emptyDescription: string
    emptyTitle: string
    icon: React.ReactNode
    title: string
  }
> = {
  instruction: {
    title: "Instructions",
    description: "Pages the AI reads as persistent context.",
    emptyTitle: "No instructions",
    emptyDescription:
      "Create a new instruction or add an existing page.",
    icon: <BookOpenIcon />,
  },
  skill: {
    title: "Skills",
    description: "Pages the AI can invoke as specialized capabilities.",
    emptyTitle: "No skills",
    emptyDescription:
      "Create a new skill or add an existing page.",
    icon: <WandSparklesIcon />,
  },
}

export function ZilobaseAiSection({
  isLoading,
  items,
  mode,
  onExpandPage,
  workspaceId,
}: {
  isLoading: boolean
  items: ZilobaseAiPageSummary[]
  mode: ZilobaseAiMode
  onExpandPage?: (pageId: string) => void
  workspaceId: string | null
}) {
  const config = sectionConfig[mode]
  const existingPageIds = items.map((page) => page.id)
  const isEmpty = items.length === 0

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            {config.title}
          </h3>
          <p className="text-sm text-content-secondary">{config.description}</p>
        </div>
        {!isLoading ? (
          <ZilobaseAiCreateMenu
            existingPageIds={existingPageIds}
            mode={mode}
            onOpenPage={onExpandPage}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <div>
          {isLoading ? (
            <ZilobaseAiSectionSkeleton />
          ) : isEmpty ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{config.icon}</EmptyMedia>
                <EmptyTitle>{config.emptyTitle}</EmptyTitle>
                <EmptyDescription>{config.emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ZilobaseAiItemList>
              {items.map((page) => (
                <ZilobaseAiItem
                  key={page.id}
                  mode={mode}
                  onExpandPage={onExpandPage}
                  page={page}
                />
              ))}
            </ZilobaseAiItemList>
          )}
      </div>
    </section>
  )
}

function ZilobaseAiSectionSkeleton() {
  return (
    <div className="grid gap-2 py-4">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton className="h-11" key={index} />
      ))}
    </div>
  )
}
