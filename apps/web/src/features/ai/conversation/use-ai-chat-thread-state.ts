import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import { useAiChatThreads } from "@zilobase/features/ai-chat";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { isHostedDemoRuntime } from "@/features/demo";

type StoredAiChatThreadState = {
  activeThreadId: string | null;
  bootstrapped: boolean;
  draftAgentProfileId: string | null;
};

type AiChatThreadStore = {
  threadStateByWorkspaceId: Record<
    string,
    StoredAiChatThreadState | undefined
  >;
};

const emptyThreadState: StoredAiChatThreadState = {
  activeThreadId: null,
  bootstrapped: false,
  draftAgentProfileId: null,
};

const useAiChatThreadStore = create<AiChatThreadStore>()(() => ({
  threadStateByWorkspaceId: {},
}));

function updateStoredThreadState(
  workspaceId: string,
  getNext: (current: StoredAiChatThreadState) => StoredAiChatThreadState,
) {
  useAiChatThreadStore.setState((state) => {
    const current =
      state.threadStateByWorkspaceId[workspaceId] ?? emptyThreadState;
    const next = getNext(current);

    if (next === current) {
      return state;
    }

    return {
      threadStateByWorkspaceId: {
        ...state.threadStateByWorkspaceId,
        [workspaceId]: next,
      },
    };
  });
}

function initializeActiveThreadId(
  workspaceId: string,
  threadId: string | null,
  draftAgentProfileId: string | null,
) {
  useAiChatThreadStore.setState((state) => {
    if (state.threadStateByWorkspaceId[workspaceId]) {
      return state;
    }

    return {
      threadStateByWorkspaceId: {
        ...state.threadStateByWorkspaceId,
        [workspaceId]: {
          activeThreadId: threadId,
          bootstrapped: false,
          draftAgentProfileId,
        },
      },
    };
  });
}

function setStoredActiveThreadId(
  workspaceId: string,
  threadId: string | null,
) {
  updateStoredThreadState(workspaceId, (current) =>
    current.activeThreadId === threadId
      ? current
      : { ...current, activeThreadId: threadId },
  );
}

function setStoredDraftAgentProfileId(
  workspaceId: string,
  agentProfileId: string | null,
) {
  updateStoredThreadState(workspaceId, (current) => ({
    ...current,
    activeThreadId: null,
    draftAgentProfileId: agentProfileId,
  }));
}

function markBootstrapped(workspaceId: string) {
  const current =
    useAiChatThreadStore.getState().threadStateByWorkspaceId[
      workspaceId
    ] ?? emptyThreadState;

  if (current.bootstrapped) {
    return false;
  }

  updateStoredThreadState(workspaceId, (latest) => ({
    ...latest,
    bootstrapped: true,
  }));

  return true;
}

function getCurrentUrlThreadId() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    new URLSearchParams(window.location.search).get("thread")?.trim() || null
  );
}

function getCurrentUrlAgentId() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("agent")?.trim() || null;
}

function replaceAiThreadSearchParam(
  threadId: string | null,
  draftAgentProfileId?: string | null,
) {
  if (typeof window === "undefined" || window.location.pathname !== "/ai") {
    return;
  }

  const url = new URL(window.location.href);

  if (threadId) {
    url.searchParams.set("thread", threadId);
    url.searchParams.delete("agent");
  } else {
    url.searchParams.delete("thread");
    if (draftAgentProfileId) url.searchParams.set("agent", draftAgentProfileId);
    else url.searchParams.delete("agent");
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function useAiChatThreadState(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const workspaceId = useActiveWorkspaceId();
  const threadsQuery = useAiChatThreads({ enabled });
  const threadState = useAiChatThreadStore((state) =>
    workspaceId
      ? state.threadStateByWorkspaceId[workspaceId]
      : undefined,
  );

  const activeThreadId = threadState?.activeThreadId ?? null;
  const draftAgentProfileId = threadState?.draftAgentProfileId ?? null;
  const hasInitializedActiveThread = Boolean(threadState);
  const hasBootstrappedActiveThread = Boolean(threadState?.bootstrapped);

  const setActiveThreadId = useCallback(
    (threadId: string | null) => {
      if (!workspaceId) {
        return;
      }

      setStoredActiveThreadId(workspaceId, threadId);

      if (pathname === "/ai") {
        replaceAiThreadSearchParam(threadId, draftAgentProfileId);
      }
    },
    [workspaceId, pathname, draftAgentProfileId],
  );

  const setDraftAgentProfileId = useCallback(
    (agentProfileId: string | null) => {
      if (!workspaceId) return;
      setStoredDraftAgentProfileId(workspaceId, agentProfileId);
      if (pathname === "/ai") replaceAiThreadSearchParam(null, agentProfileId);
    },
    [pathname, workspaceId],
  );

  useEffect(() => {
    if (!enabled || !workspaceId || hasInitializedActiveThread) {
      return;
    }

    const initialThreadId =
      pathname === "/ai" ? getCurrentUrlThreadId() : null;

    initializeActiveThreadId(
      workspaceId,
      initialThreadId,
      pathname === "/ai" && !initialThreadId ? getCurrentUrlAgentId() : null,
    );
  }, [enabled, hasInitializedActiveThread, workspaceId, pathname]);

  useEffect(() => {
    if (
      !enabled ||
      !workspaceId ||
      !hasInitializedActiveThread ||
      hasBootstrappedActiveThread ||
      threadsQuery.isLoading
    ) {
      return;
    }

    const threads = threadsQuery.data?.threads ?? [];

    if (
      activeThreadId &&
      threads.some((thread) => thread.id === activeThreadId)
    ) {
      markBootstrapped(workspaceId);
      return;
    }

    const fallbackThreadId = isHostedDemoRuntime()
      ? threads.find((thread) => thread.pinnedAt)?.id ?? threads[0]?.id ?? null
      : null;
    setStoredActiveThreadId(workspaceId, fallbackThreadId);
    markBootstrapped(workspaceId);
    replaceAiThreadSearchParam(fallbackThreadId, draftAgentProfileId);
  }, [
    activeThreadId,
    draftAgentProfileId,
    enabled,
    hasBootstrappedActiveThread,
    hasInitializedActiveThread,
    workspaceId,
    setActiveThreadId,
    setDraftAgentProfileId,
    threadsQuery.data?.threads,
    threadsQuery.isLoading,
  ]);

  return {
    activeThreadId,
    draftAgentProfileId,
    isBootstrapping:
      enabled &&
      (!workspaceId ||
        !hasInitializedActiveThread ||
        !hasBootstrappedActiveThread ||
        threadsQuery.isLoading),
    setActiveThreadId,
    setDraftAgentProfileId,
    threadsQuery,
  };
}
