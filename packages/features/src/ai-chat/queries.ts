import type { AiAgentPreference, AiChatThreadsResponse, AiChatThreadMessagesResponse } from "./contracts";
export type {
  AiChatThread,
  AiChatFeedback,
  AiAgentPreference,
  AiChatThreadsResponse,
  AiChatThreadResponse,
  AiChatThreadMessagesResponse,
} from "./contracts";
import { queryOptions } from "@tanstack/react-query"


import type { ApiFetcher } from "../shared/api-fetcher"
import { workspaceRequestOptions } from "../workspaces/queries"

export const aiChatThreadsQueryKey = (
  workspaceId: string | null | undefined,
  search?: string,
) => {
  const base = ["workspaces", workspaceId ?? "none", "ai-chat", "threads"] as const
  const normalized = search?.trim()
  return normalized ? [...base, "search", normalized] as const : base
}

export const aiAgentPreferenceQueryKey = (
  workspaceId: string | null | undefined,
) => ["workspaces", workspaceId ?? "none", "ai-chat", "preference"] as const

export const aiChatThreadMessagesQueryKey = (
  workspaceId: string | null | undefined,
  threadId: string | null | undefined,
) =>
  [
    "workspaces",
    workspaceId ?? "none",
    "ai-chat",
    "threads",
    threadId ?? "none",
    "messages",
  ] as const

export const aiChatThreadsQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  search?: string,
) =>
  queryOptions({
    queryKey: aiChatThreadsQueryKey(workspaceId, search),
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<AiChatThreadsResponse>(
        `/api/ai/threads${search?.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`,
        workspaceRequestOptions(workspaceId, { signal }),
      ),
  })

export const aiAgentPreferenceQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiAgentPreferenceQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) =>
      apiFetch<{ preference: AiAgentPreference }>(
        "/api/ai/preferences",
        workspaceRequestOptions(workspaceId, { signal }),
      ).then((result) => result.preference),
  })

export const aiChatThreadMessagesQueryOptions = (
  apiFetch: ApiFetcher,
  workspaceId: string | null | undefined,
  threadId: string | null | undefined,
) =>
  queryOptions({
    queryKey: aiChatThreadMessagesQueryKey(workspaceId, threadId),
    enabled: Boolean(workspaceId && threadId),
    queryFn: ({ signal }) =>
      apiFetch<AiChatThreadMessagesResponse>(
        `/api/ai/threads/${encodeURIComponent(threadId!)}/messages`,
        workspaceRequestOptions(workspaceId, { signal }),
      ),
  })
