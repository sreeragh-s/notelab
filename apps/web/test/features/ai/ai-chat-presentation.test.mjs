import { readChatbotSource } from "./ai-chatbot-source.mjs"

export function register({ readSource, assert, test }) {
  test("Ask AI supports persistent docked and floating desktop modes", async () => {
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const sidebarSource = await readSource("/src/features/ai/components/chat-sidebar.tsx")

    assert.match(
      layoutSource,
      /CHAT_PRESENTATION_MODE_STORAGE_KEY\s*=\s*"zilobase:ai-chat-presentation-mode"/,
    )
    assert.match(
      layoutSource,
      /chatSidebarOpen\s*&&\s*!isMobile\s*&&\s*chatPresentationMode\s*===\s*"floating"/,
    )
    assert.match(layoutSource, /aria-label="Floating Ask AI chat"/)
    assert.match(layoutSource, /<FloatingWidget aria-label="Floating Ask AI chat">/)
    assert.match(
      layoutSource,
      /chatPanel=\{dockedChatOpen \? chatPanel : null\}/,
    )
    assert.match(
      sidebarSource,
      /export type ChatPresentationMode = "floating" \| "sidebar"/,
    )
    assert.match(sidebarSource, /onPresentationModeChange/)
  })

  test("mobile Ask AI hides desktop-only floating and pin controls", async () => {
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const historySource = await readSource("/src/features/ai/components/elements/ai-chat-history-list.tsx")

    assert.match(
      layoutSource,
      /onPresentationModeChange=\{isMobile \? undefined : setChatPresentationMode\}/,
    )
    assert.match(historySource, /canPin=\{!isMobile\}/)
    assert.match(historySource, /className="sticky top-0 z-10 pb-2 pt-1"/)
    assert.doesNotMatch(historySource, /sticky top-0 z-10 bg-sidebar px-1/)
  })

  test("full-page Ask AI uses the page viewport and hides the duplicate launcher", async () => {
    const aiPageSource = await readSource("/src/features/ai/pages/ai.tsx")
    const workspaceSource = await readSource("/src/features/ai/components/agent-chat-workspace.tsx")
    const chatbotSource = await readChatbotSource(readSource)
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")
    const sidePaneSource = await readSource("/src/features/pages/context/page-side-pane.tsx")

    assert.match(layoutSource, /chatSidebarOpen \|\| isAiPage \|\| Boolean\(agentId\) \|\| isMailPage \? null/)
    assert.match(sidePaneSource, /data-page-scroll-viewport/)
    assert.match(chatbotSource, /\[data-ai-scroll-shell\], \[data-page-scroll-viewport\]/)
    assert.match(chatbotSource, /isSidebar\s*\? undefined\s*:\s*"h-auto! overflow-visible! \[scrollbar-gutter:auto\]!"/)
    assert.match(aiPageSource, /<AgentChatWorkspace/)
    assert.match(workspaceSource, /mainScrollClassName="overscroll-y-none"/)
    assert.doesNotMatch(workspaceSource, /standalone/)
    assert.match(layoutSource, /aiWorkspaceSidePaneOpen/)
    assert.match(layoutSource, /auxiliarySidePaneOpen=\{showAuxiliaryWorkspaceSidePaneLayout\}/)
    assert.match(headerSource, /auxiliarySidePaneOpen \|\| showItemSidePaneHeader/)
    assert.doesNotMatch(aiPageSource, /<main className="[^"]*overflow-hidden/)
  })

  test("Universal Ask AI uses the standard side-pane controls without an agent rail", async () => {
    const workspaceSource = await readSource("/src/features/ai/components/agent-chat-workspace.tsx")
    const settingsSource = await readSource("/src/features/ai/components/ai-settings-panel.tsx")
    const agentSettingsSource = await readSource("/src/features/settings/pages/zilobase-ai/components/custom-agents-section.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")
    const paneHeaderSource = await readSource("/src/features/pages/components/page-pane-header.tsx")

    assert.match(workspaceSource, /\{isSidebar \? <ChatHeader/)
    assert.match(workspaceSource, /aria-label="Ask AI settings"/)
    assert.doesNotMatch(workspaceSource, /AgentRail|Add Agent|draftAgentProfileId=\{selectedAgentId\}/)
    assert.doesNotMatch(workspaceSource, /draftAgentProfileId|draftAgentName|draftAgentDescription/)
    assert.match(headerSource, /<PageSidePaneCollapseButton[\s\S]*?label=\{auxiliarySidePaneCloseLabel\}/)
    assert.match(paneHeaderSource, /export function PageSidePaneCollapseButton/)
    assert.match(paneHeaderSource, /<PageSidePaneCollapseButton onClick=\{onClose\} \/>/)
    assert.doesNotMatch(settingsSource, /<header className="[^"]*border-b/)
    assert.doesNotMatch(settingsSource, /overflow-x-auto border-b/)
    assert.match(settingsSource, /<AgentEditor agentId=\{agentId\} initialTab=\{initialTab\} plain \/>/)
    assert.doesNotMatch(agentSettingsSource, /overflow-x-auto border-b/)
  })

  test("Custom Agents reuse the full-height page side-pane workspace", async () => {
    const agentPageSource = await readSource("/src/features/ai/pages/custom-agent.tsx")
    const agentHeaderSource = await readSource("/src/features/ai/components/custom-agent-header-actions.tsx")
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")

    assert.match(agentPageSource, /<PageSidePaneLayout/)
    assert.match(agentPageSource, /<PageMetadata/)
    assert.match(agentPageSource, /contentClassName="mx-auto max-w-\[900px\]"/)
    assert.match(agentPageSource, /enableComments=\{false\}/)
    assert.match(agentHeaderSource, /<AgentSharePopover agent=\{agent\.data\}/)
    assert.match(agentHeaderSource, /export function CustomAgentShareHeaderAction/)
    assert.match(agentHeaderSource, /Open Custom Agent settings/)
    assert.match(agentPageSource, /Build, run, and control this sandboxed Custom Agent/)
    assert.match(agentPageSource, /<AgentChat agentId=\{agentId\}/)
    assert.doesNotMatch(agentPageSource, /<TabsTrigger value="chat">/)
    assert.match(layoutSource, /agentWorkspaceSidePaneOpen = agentWorkspacePanel === "settings"/)
    assert.match(layoutSource, /showAiWorkspaceSidePaneLayout \|\| showAgentWorkspaceSidePaneLayout/)
    assert.match(layoutSource, /auxiliarySidePaneCloseLabel=\{agentId \? "Close Custom Agent settings" : "Close AI settings"\}/)
  })

  test("Ask AI and Custom Agents share route-driven side pane behavior", async () => {
    const workspaceSource = await readSource("/src/features/ai/components/agent-chat-workspace.tsx")
    const agentPageSource = await readSource("/src/features/ai/pages/custom-agent.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")

    assert.match(workspaceSource, /routeSearch\.get\("panel"\) === "settings"/)
    assert.match(workspaceSource, /url\.searchParams\.delete\("p"\)/)
    assert.match(workspaceSource, /url\.searchParams\.delete\("d"\)/)
    assert.match(workspaceSource, /<PageSidePaneLayout/)
    assert.match(agentPageSource, /<PageSidePaneLayout/)
    assert.match(headerSource, /showAgentActionsInSidePane/)
    assert.match(headerSource, /<CustomAgentShareHeaderAction agentId=\{agentId\}/)
  })

  test("Instruction and skill menus distinguish creating from adding", async () => {
    const menuSource = await readSource("/src/features/settings/pages/zilobase-ai/components/zilobase-ai-create-menu.tsx")

    assert.match(menuSource, /addItemLabel: "Add instruction"/)
    assert.match(menuSource, /createItemLabel: "Create instruction"/)
    assert.match(menuSource, /addItemLabel: "Add skill"/)
    assert.match(menuSource, /existingPageIds\.length > 0[\s\S]*\? config\.addItemLabel[\s\S]*: config\.createItemLabel/)
    assert.match(menuSource, /<span>\{config\.createItemLabel\}<\/span>/)
  })

  test("Ask AI settings use editable instruction pages without preference controls", async () => {
    const settingsSource = await readSource("/src/features/ai/components/ai-settings-panel.tsx")
    const itemSource = await readSource("/src/features/settings/pages/zilobase-ai/components/zilobase-ai-item.tsx")
    const workspaceSource = await readSource("/src/features/ai/components/agent-chat-workspace.tsx")
    const layoutSource = await readSource("/src/app/shell/content/app-layout.tsx")

    assert.doesNotMatch(settingsSource, /label: "Preferences"/)
    assert.doesNotMatch(settingsSource, /Response style|Save preferences/)
    assert.match(settingsSource, /isPersonalTab\(initialTab\) \? initialTab : "knowledge"/)
    assert.match(itemSource, /<PageEditorPane/)
    assert.match(itemSource, /aria-label=\{`Expand \$\{page\.name/)
    assert.match(workspaceSource, /routeSearch\.get\("settingsPage"\)/)
    assert.match(layoutSource, /if \(search\.has\("settingsPage"\)\)/)
  })
}
