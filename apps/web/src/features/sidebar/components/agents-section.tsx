import { useNavigate } from "@tanstack/react-router"
import { useAiAgentProfiles } from "@zilobase/features/ai-chat"

import { BotIcon, ChevronRightIcon } from "@/shared/components/icons"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state"

export function AgentsSection({ activeAgentId }: { activeAgentId: string | null }) {
  const navigate = useNavigate()
  const agents = useAiAgentProfiles()
  const [open, setOpen] = useSidebarSectionOpen("zilobase:sidebar:agents")
  if (!agents.data?.length) return null
  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible min-h-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel asChild className="hover:bg-action-neutral-hover hover:text-action-on-neutral">
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>Agents</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {agents.data.map((agent) => (
                <SidebarMenuItem key={agent.id}>
                  <SidebarMenuButton
                    isActive={activeAgentId === agent.id}
                    onClick={() => void navigate({ params: { agentId: agent.id }, to: "/agents/$agentId" })}
                    title={agent.name}
                    type="button"
                  >
                    <BotIcon /><span className="truncate">{agent.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
