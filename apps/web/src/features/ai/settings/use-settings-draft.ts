import { recoverSettingsDraft, settingsDraftVersionChanged } from "./model/draft-recovery";
import * as React from "react";
import { settingsDraftSummary } from "./model/draft-summary";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "@zilobase/features";
import { useSession } from "@zilobase/features/auth/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import type {
  AgentSettingsDefinition,
  AgentSettingsState,
  AgentSettingsEvent,
} from "@zilobase/features/ai-chat";

const editingScopes = new Set<string>();
export const isSettingsEditing = (scope: string) => editingScopes.has(scope);
export function emitSettingsEvent(event: AgentSettingsEvent) {
  if (event.status === "editing") editingScopes.add(event.scope);
  else editingScopes.delete(event.scope);
  window.dispatchEvent(new CustomEvent("agent-settings", { detail: event }));
}
const flushers = new Set<() => Promise<void>>();
export async function flushSettingsDrafts() {
  await Promise.all([...flushers].map((flush) => flush()));
}
export function useSettingsDraft(scope: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const key = ["agent-settings", workspaceId, userId, scope];
  const storageKey = JSON.stringify(key);
  const base = `/api/ai/settings/${encodeURIComponent(scope)}`;
  const headers = { "x-zilobase-workspace-id": workspaceId ?? "" };
  const query = useQuery({
    queryKey: key,
    enabled: !!workspaceId && !!userId,
    queryFn: ({ signal }) =>
      apiFetch<AgentSettingsState>(`${base}/draft`, { signal, headers }),
    staleTime: 0,
    refetchInterval: 2000,
  });
  const [state, setState] = React.useState<AgentSettingsState>();
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const current = React.useRef<AgentSettingsState | undefined>(undefined);
  const blocked = React.useRef(false);
  const inFlight = React.useRef(false);
  const channel = React.useRef<BroadcastChannel | null>(null);
  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel(`zilobase:${storageKey}`);
    channel.current = connection;
    connection.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: key });
    };
    return () => {
      channel.current = null;
      connection.close();
    };
  }, [storageKey]);
  const pending = React.useRef<Partial<AgentSettingsDefinition>>({});
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const remember = () => {
    if (!current.current) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          baseVersion: current.current.baseVersion,
          draftVersion: current.current.draftVersion,
          patch: pending.current,
        }),
      );
    } catch {
      /* Server draft remains available. */
    }
  };
  React.useEffect(() => {
    if (!query.data || inFlight.current || Object.keys(pending.current).length)
      return;
    if (settingsDraftVersionChanged(current.current, query.data))
      setDocumentVersion((n) => n + 1);
    let next = query.data;
    try {
      const recovery = recoverSettingsDraft(query.data, localStorage.getItem(storageKey));
      if (recovery) {
        pending.current = recovery.patch;
        next = recovery.state;
        if (recovery.conflict) {
          blocked.current = true;
          setError("A newer draft exists. Your local edits are preserved; discard to load the saved version.");
        }
      }
    } catch {
      /* Ignore damaged local recovery data. */
    }
    current.current = next;
    setState(next);
  }, [query.data, storageKey]);
  const flush = React.useCallback(async () => {
    clearTimeout(timer.current);
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (blocked.current)
          throw new Error("Resolve the conflicting draft before saving.");
        const before = current.current;
        const patch = pending.current;
        if (!before || !Object.keys(patch).length) return;
        pending.current = {};
        setSyncing(true);
        inFlight.current = true;
        try {
          await queryClient.cancelQueries({ queryKey: key });
          const result = await apiFetch<AgentSettingsState>(`${base}/draft`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              patch,
              baseVersion: before.baseVersion,
              draftVersion: before.draftVersion,
            }),
          });
          current.current = {
            ...result,
            definition: { ...result.definition, ...pending.current },
          };
          setState(current.current);
          queryClient.setQueryData(key, result);
          setError(null);
          remember();
          channel.current?.postMessage("updated");
        } catch (e) {
          pending.current = { ...patch, ...pending.current };
          setError(
            e instanceof Error ? e.message : "Could not preserve draft.",
          );
          remember();
          throw e;
        } finally {
          inFlight.current = false;
          setSyncing(false);
        }
      });
    return queue.current;
  }, [base, workspaceId, userId]);
  React.useEffect(() => {
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      clearTimeout(timer.current);
      void flush().catch(() => {});
    };
  }, [flush]);
  React.useEffect(() => {
    const listener = (e: Event) => {
      const event = (e as CustomEvent<AgentSettingsEvent>).detail;
      if (event.scope === scope && event.status !== "editing")
        void queryClient.invalidateQueries({ queryKey: key });
    };
    window.addEventListener("agent-settings", listener);
    return () => window.removeEventListener("agent-settings", listener);
  }, [scope, storageKey]);
  const patch = (value: Partial<AgentSettingsDefinition>) => {
    if (!current.current?.canEdit) return;
    pending.current = { ...pending.current, ...value };
    current.current = {
      ...current.current,
      definition: { ...current.current.definition, ...value },
    };
    setState(current.current);
    remember();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), 400);
  };
  const creatingInstruction = React.useRef(false);
  const createInstruction = useMutation({
    mutationFn: async () => {
      if (creatingInstruction.current) throw new Error("An instruction is already being created.");
      creatingInstruction.current = true;
      try {
        await flush();
        inFlight.current = true;
        await queryClient.cancelQueries({ queryKey: key });
        const value = current.current!;
        return await apiFetch<AgentSettingsState>(`${base}/instructions`, {
          method: "POST", headers,
          body: JSON.stringify({ baseVersion: value.baseVersion, draftVersion: value.draftVersion }),
        });
      } finally {
        creatingInstruction.current = false;
        inFlight.current = false;
      }
    },
    onSuccess: (result) => {
      current.current = { ...result, definition: { ...result.definition, ...pending.current } };
      setState(current.current);
      setError(null);
      remember();
      queryClient.setQueryData(key, result);
      channel.current?.postMessage("updated");
    },
    onError: (e) => setError(e.message),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await flush();
      const value = current.current!;
      const result = await apiFetch<AgentSettingsState & { runError?: string }>(
        `${base}/publish`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            baseVersion: value.baseVersion,
            draftVersion: value.draftVersion,
          }),
        },
      );
      return result;
    },
    onSuccess: (result) => {
      setReviewOpen(false);
      current.current = result;
      setState(result);
      setError(null);
      localStorage.removeItem(storageKey);
      channel.current?.postMessage("updated");
      queryClient.setQueryData(key, result);
      void queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceId],
      });
      void queryClient.invalidateQueries({ queryKey: [...key, "versions"] });
    },
    onError: (e) => setError(e.message),
  });
  const discard = useMutation({
    mutationFn: async () => {
      clearTimeout(timer.current);
      await queue.current.catch(() => {});
      const latest = await apiFetch<AgentSettingsState>(`${base}/draft`, {
        headers,
      });
      return apiFetch<AgentSettingsState>(`${base}/draft`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ draftVersion: latest.draftVersion }),
      });
    },
    onSuccess: (result) => {
      setReviewOpen(false);
      blocked.current = false;
      setDocumentVersion((version) => version + 1);
      pending.current = {};
      current.current = result;
      setState(result);
      setError(null);
      localStorage.removeItem(storageKey);
      channel.current?.postMessage("updated");
      queryClient.setQueryData(key, result);
    },
    onError: (e) => setError(e.message),
  });
  const { changedFields, changedTabs, dirty } = settingsDraftSummary(state);
  const reviewChanges = () => {
    setReviewOpen(true);
    emitSettingsEvent({ scope, tab: changedTabs[0] ?? "instructions", status: "ready" });
  };
  return {
    state,
    changedFields,
    changedTabs,
    reviewChanges,
    reviewOpen,
    patch,
    flush,
    publish,
    createInstruction,
    discard,
    syncing,
    documentVersion,
    error: error ?? query.error?.message ?? null,
    loading: query.isLoading,
    base,
    headers,
    key,
    dirty,
  };
}
