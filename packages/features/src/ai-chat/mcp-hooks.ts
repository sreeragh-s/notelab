import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import { useActiveWorkspaceId } from "../workspaces/hooks"
import { workspaceRequestOptions } from "../workspaces/queries"
import type {
  AiAgentProfileDetail,
  AiAgentProfileSummary,
  McpActivityEntry,
  McpApprovedServer,
  McpConnectionSummary,
  McpConnectionScopeRef,
  McpServerCatalogEntry,
  McpWorkspacePolicy,
} from "./mcp-contract"

export const aiAgentProfilesQueryKey = (workspaceId: string | null | undefined) =>
  ["workspaces", workspaceId ?? "none", "ai-agent-profiles"] as const

export function useAiAgentProfiles(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: aiAgentProfilesQueryKey(workspaceId),
    queryFn: ({ signal }) => apiFetch<{ agents: AiAgentProfileSummary[] }>(
      "/api/ai/agents",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agents),
    retry: false,
  })
}

export function useAiAgentProfile(agentId: string | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && agentId),
    queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId],
    queryFn: ({ signal }) => apiFetch<{ agent: AiAgentProfileDetail }>(
      `/api/ai/agents/${encodeURIComponent(agentId!)}`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.agent),
  })
}

export function useCreateAiAgentProfile() {
  return useAgentMutation<{
    name: string
    description?: string
    instructions?: string
    defaultModel?: string
    icon?: unknown
  }, { agent: AiAgentProfileDetail }>(
    () => "/api/ai/agents",
    "POST",
  )
}

export function useUpdateAiAgentProfile(agentId: string | null) {
  return useAgentMutation<Partial<Pick<AiAgentProfileDetail, "name" | "description" | "instructions" | "defaultModel">>, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}`,
    "PATCH",
    agentId,
  )
}

export function useReplaceAiAgentProfileAccess(agentId: string | null) {
  return useAgentMutation<{
    grants: Array<{
      principalId: string
      principalType: "user" | "team"
      role: "editor" | "user"
    }>
  }, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/access`,
    "PUT",
    agentId,
  )
}

export function useTransferAiAgentProfile(agentId: string | null) {
  return useAgentMutation<{ newOwnerUserId: string }, { agent: AiAgentProfileDetail }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/transfer`,
    "POST",
    agentId,
  )
}

export function useArchiveAiAgentProfile(agentId: string | null) {
  return useAgentMutation<Record<string, never>, { result: {
    archived: boolean
    hasExistingThreads: boolean
  } }>(
    () => `/api/ai/agents/${encodeURIComponent(agentId!)}/archive`,
    "POST",
    agentId,
  )
}

export function useMcpCatalog(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-catalog"],
    queryFn: ({ signal }) => apiFetch<{ catalog: McpServerCatalogEntry[] }>(
      "/api/ai/mcp/catalog",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.catalog),
    retry: false,
  })
}

export function useApprovedMcpServers(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-approved-servers"],
    queryFn: ({ signal }) => apiFetch<{ approvedServers: McpApprovedServer[] }>(
      "/api/ai/mcp/approved-servers",
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.approvedServers),
    retry: false,
  })
}

export function useMcpWorkspacePolicy(options?: { enabled?: boolean }) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp-policy"],
    queryFn: ({ signal }) => apiFetch<{
      approvedServers: McpApprovedServer[]
      policy: McpWorkspacePolicy
    }>("/api/ai/mcp/policy", workspaceRequestOptions(workspaceId, { signal })),
    retry: false,
  })
}

export function useMcpPolicyMutation<TInput extends object, TOutput>(
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: method === "DELETE" ? undefined : JSON.stringify(input),
      headers: {
        ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceId ?? "none", "mcp-policy"] })
      void queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceId ?? "none", "mcp-approved-servers"] })
    },
  })
}

export function mcpScopeApiPath(scope: McpConnectionScopeRef) {
  return scope.type === "agent"
    ? `/api/ai/agents/${encodeURIComponent(scope.agentProfileId)}`
    : "/api/ai/mcp"
}

function mcpScopeQueryKey(scope: McpConnectionScopeRef | null) {
  return scope?.type === "agent"
    ? ["agent", scope.agentProfileId]
    : ["personal"]
}

export function useMcpConnections(scope: McpConnectionScopeRef | null) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && scope),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "connections"],
    queryFn: ({ signal }) => apiFetch<{ connections: McpConnectionSummary[] }>(
      `${mcpScopeApiPath(scope!)}/connections`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.connections),
  })
}

export function useMcpActivity(scope: McpConnectionScopeRef | null, enabled: boolean) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  return useQuery({
    enabled: Boolean(workspaceId && scope && enabled),
    queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "activity"],
    queryFn: ({ signal }) => apiFetch<{ activity: McpActivityEntry[] }>(
      `${mcpScopeApiPath(scope!)}/activity`,
      workspaceRequestOptions(workspaceId, { signal }),
    ).then((result) => result.activity),
  })
}

export function useMcpConnectionMutation<TInput extends object, TOutput>(
  scope: McpConnectionScopeRef | null,
  path: (input: TInput) => string,
  method: "POST" | "PUT" | "DELETE",
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: method === "DELETE" ? undefined : JSON.stringify(input),
      headers: {
        ...(method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId ?? "none", "mcp", ...mcpScopeQueryKey(scope), "connections"],
      })
      void queryClient.invalidateQueries({ queryKey: aiAgentProfilesQueryKey(workspaceId) })
    },
  })
}

function useAgentMutation<TInput extends object, TOutput>(
  path: (input: TInput) => string,
  method: "POST" | "PATCH" | "PUT",
  agentId?: string | null,
) {
  const { apiFetch } = useZilobaseFeatures()
  const workspaceId = useActiveWorkspaceId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => apiFetch<TOutput>(path(input), {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        ...(workspaceId ? { "x-zilobase-workspace-id": workspaceId } : {}),
      },
      method,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: aiAgentProfilesQueryKey(workspaceId) })
      if (agentId) void queryClient.invalidateQueries({
        queryKey: [...aiAgentProfilesQueryKey(workspaceId), agentId],
      })
    },
  })
}
