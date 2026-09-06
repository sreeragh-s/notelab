const chatbotFiles = [
  "/src/features/ai/conversations/components/elements/chatbot.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-composer.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-messages.tsx",
  "/src/features/ai/conversations/components/elements/chatbot-scroll-control.tsx",
]

export async function readChatbotSource(readSource) {
  return (await Promise.all(chatbotFiles.map((file) => readSource(file)))).join("\n")
}
