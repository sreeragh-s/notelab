import { useRouter, useRouterState } from "@tanstack/react-router"

import { useAiAgentProfile } from "@zilobase/features/ai-chat"

import { AgentSharePopover } from "@/features/settings/pages/zilobase-ai/components/custom-agents-section"
import { SlidersHorizontalIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"

export function CustomAgentHeaderActions({ agentId }: { agentId: string }) {
  const agent = useAiAgentProfile(agentId)
  const router = useRouter()
  const { hash, pathname, searchStr } = useRouterState({
    select: (state) => ({
      hash: state.location.hash,
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  })
  const search = new URLSearchParams(searchStr)
  const settingsOpen = search.get("panel") === "settings"

  const toggleSettings = () => {
    const next = new URLSearchParams(searchStr)
    if (settingsOpen) {
      next.delete("panel")
      next.delete("settingsTab")
    } else {
      next.set("panel", "settings")
      next.set("settingsTab", next.get("settingsTab") ?? "overview")
    }
    const query = next.toString()
    router.history.replace(`${pathname}${query ? `?${query}` : ""}${hash}`)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={settingsOpen ? "Close Custom Agent settings" : "Open Custom Agent settings"}
        aria-pressed={settingsOpen}
        className={settingsOpen ? "bg-action-neutral-pressed text-action-on-neutral" : undefined}
        onClick={toggleSettings}
        size="icon"
        title={settingsOpen ? "Close settings" : "Settings"}
        type="button"
        variant="ghost"
      >
        <SlidersHorizontalIcon />
      </Button>
      {agent.data ? <AgentSharePopover agent={agent.data} /> : null}
    </div>
  )
}

