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

    assert.match(layoutSource, /chatSidebarOpen \|\| isAiPage \|\| isMailPage \? null/)
    assert.match(sidePaneSource, /data-page-scroll-viewport/)
    assert.match(chatbotSource, /\[data-ai-scroll-shell\], \[data-page-scroll-viewport\]/)
    assert.match(chatbotSource, /isSidebar\s*\? undefined\s*:\s*"h-auto! overflow-visible! \[scrollbar-gutter:auto\]!"/)
    assert.match(aiPageSource, /<AgentChatWorkspace/)
    assert.match(workspaceSource, /mainScrollClassName="overscroll-y-none"/)
    assert.doesNotMatch(workspaceSource, /standalone/)
    assert.match(layoutSource, /aiWorkspaceSidePaneOpen/)
    assert.match(layoutSource, /auxiliarySidePaneOpen=\{showAiWorkspaceSidePaneLayout\}/)
    assert.match(headerSource, /auxiliarySidePaneOpen \|\| showItemSidePaneHeader/)
    assert.doesNotMatch(aiPageSource, /<main className="[^"]*overflow-hidden/)
  })

  test("Ask AI uses the database toolbar and standard side-pane controls", async () => {
    const workspaceSource = await readSource("/src/features/ai/components/agent-chat-workspace.tsx")
    const headerSource = await readSource("/src/app/shell/content/app-header.tsx")
    const paneHeaderSource = await readSource("/src/features/pages/components/page-pane-header.tsx")

    assert.match(workspaceSource, /\{isSidebar \? \(\s*<ChatHeader/)
    assert.match(workspaceSource, /className="block shrink-0 px-3 py-2"/)
    assert.match(workspaceSource, /className="w-max min-w-0 justify-start"/)
    assert.match(workspaceSource, /aria-label="Ask AI settings"[\s\S]*?className="database-new-button shrink-0"/)
    assert.match(headerSource, /<PageSidePaneCollapseButton[\s\S]*?label="Close AI settings"/)
    assert.match(paneHeaderSource, /export function PageSidePaneCollapseButton/)
    assert.match(paneHeaderSource, /<PageSidePaneCollapseButton onClick=\{onClose\} \/>/)
  })
}
