import type { AgentSettingsEvent } from "@zilobase/features/ai-chat";

function parseEvent(event: string) {
  const name = event
    .split("\n")
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const raw = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return raw ? { name, data: JSON.parse(raw) } : null;
}

/** Consume complete LF-delimited events; an incomplete final event remains unapplied. */
export async function readCustomAgentEvents(
  body: ReadableStream<Uint8Array>,
  onSettings: (event: AgentSettingsEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const parsed = parseEvent(event);
      if (!parsed) continue;
      if (parsed.name === "settings") onSettings(parsed.data);
      if (parsed.name === "error") throw new Error(parsed.data.error);
    }
  }
}

export function replayCustomAgentSettingsEvents(
  messages: Array<{ id: string; createdAt: string; parts: unknown[] }>,
  mountedAt: number,
  seen: Set<string>,
  onSettings: (event: AgentSettingsEvent) => void,
) {
  for (const message of messages) {
    for (const part of message.parts) {
      const event = part as { type: string; data?: AgentSettingsEvent };
      const id = `${message.id}:${event.data?.status}`;
      if (
        event.type === "data-agent-settings" &&
        new Date(message.createdAt).getTime() >= mountedAt &&
        event.data &&
        !seen.has(id)
      ) {
        seen.add(id);
        onSettings(event.data);
      }
    }
  }
}
