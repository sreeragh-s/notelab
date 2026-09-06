import { SettingsDraftActions } from "../components/settings/settings-draft-actions";
import { useSession } from "@zilobase/features/auth/react";
import { PageMetadata } from "@/features/databases";
import { defaultUserSettings } from "@zilobase/features/user-settings";
import { useUserSettings } from "@zilobase/features/user-settings/react";
import { getApiRequestHeaders, toApiUrl } from "@/platform/network/api";
import { desktopNetworkFetch } from "@/platform/network";
import * as React from "react";
import { useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "@zilobase/features";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  type CustomAgentConversationMessage,
  type AgentSettingsEvent,
  type AgentSettingsTab,
} from "@zilobase/features/ai-chat";
import {
  useAiAgentProfile,
  useCustomAgentLegacyConversations,
  useStartCustomAgentRun,
  useWorkspaceAiModels,
} from "@zilobase/features/ai-chat/react";
import {
  PageSidePaneLayout,
} from "@/features/pages/pane/page-side-pane";
import { AgentSharePopover } from "../components/settings/agent-sharing";
import { AgentSettingsPage } from "../components/settings/agent-settings-page";
import { AgentChatLayout } from "../components/agent-chat-layout";
import { ChatbotMessages } from "../components/elements/chatbot-messages";
import { ChatbotComposer } from "../components/elements/chatbot-composer";
import type {
  ContextAttachMenuHandle,
  ContextAttachMenuEntry,
} from "../components/elements/context-attach-menu";
import {
  emitSettingsEvent,
  flushSettingsDrafts,
  useSettingsDraft,
} from "../settings/use-settings-draft";
import type { UIMessage } from "ai";
import { Button } from "@/shared/ui/button";
import { toast } from "sonner";

export default function CustomAgentPage() {
  const { agentId } = useParams({ strict: false }) as { agentId: string };
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  return (
    <CustomAgentWorkspace
      key={`${workspaceId}:${session?.user?.id}:${agentId}`}
      agentId={agentId}
    />
  );
}

function CustomAgentWorkspace({ agentId }: { agentId: string }) {
  const draft = useSettingsDraft(agentId);
  const [shareAnchor, setShareAnchor] = React.useState<HTMLElement | null>(
    null,
  );
  React.useEffect(() => {
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{ agentId: string; anchor: HTMLElement }>
      ).detail;
      if (detail.agentId === agentId)
        setShareAnchor((current) => (current ? null : detail.anchor));
    };
    window.addEventListener("agent-share", listener);
    return () => window.removeEventListener("agent-share", listener);
  }, [agentId]);
  const agent = useAiAgentProfile(agentId);
  const workspaceId = useActiveWorkspaceId();
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const router = useRouter();
  const { pathname, searchStr, hash } = useRouterState({
    select: (s) => s.location,
  });
  const search = new URLSearchParams(searchStr);
  const open = search.get("panel") === "settings";
  const setPanel = React.useCallback(
    (tab: AgentSettingsTab | null) => {
      const next = new URLSearchParams(searchStr);
      if (tab) {
        next.set("panel", "settings");
        next.set("settingsTab", tab);
      } else {
        next.delete("panel");
        next.delete("settingsTab");
      }
      router.history.replace(
        `${pathname}${next.size ? `?${next}` : ""}${hash}`,
      );
    },
    [searchStr, pathname, hash, router],
  );
  React.useEffect(() => {
    const listener = (e: Event) => {
      const event = (e as CustomEvent<AgentSettingsEvent>).detail;
      if (event.scope === agentId) setPanel(event.tab);
    };
    window.addEventListener("agent-settings", listener);
    return () => window.removeEventListener("agent-settings", listener);
  }, [agentId, setPanel]);
  if (agent.isLoading) return <p className="p-6">Loading agent…</p>;
  if (!agent.data) return <p className="p-6">Agent unavailable.</p>;
  return (
    <>
      {shareAnchor && (
        <AgentSharePopover
          agent={agent.data}
          draft={draft}
          anchor={shareAnchor}
          onClose={() => setShareAnchor(null)}
        />
      )}
      <PageSidePaneLayout
        main={
          <main
            data-agent-chat-page
            data-ai-review-name={draft.reviewOpen && draft.state?.review?.fields.includes("name") || undefined}
            className="flex h-full min-h-0 flex-col bg-surface-canvas"
          >
            <AgentChat
              agentId={agentId}
              beforeComposer={<SettingsDraftActions draft={draft} card />}
              header={
                <>
                  <PageMetadata
                    headingLabel="Agent"
                    titlePlaceholder="Untitled agent"
                    descriptionPlaceholder="Describe what this agent does…"
                    descriptionInitiallyHidden
                    contentClassName={
                      userSettings.pageFullWidth ? "" : "mx-auto max-w-[900px]"
                    }
                    cover={
                      (draft.state
                        ? draft.state.definition.cover
                        : agent.data.cover) ?? ""
                    }
                    icon={
                      typeof (draft.state
                        ? draft.state.definition.icon
                        : agent.data.icon) === "string"
                        ? String(
                            draft.state
                              ? draft.state.definition.icon
                              : agent.data.icon,
                          )
                        : ""
                    }
                    iconPosition={
                      draft.state?.definition.iconPosition ??
                      agent.data.iconPosition
                    }
                    title={draft.state?.definition.name ?? agent.data.name}
                    description={
                      draft.state?.definition.description ??
                      agent.data.description
                    }
                    editable={
                      !!draft.state?.canEdit &&
                      !draft.publish.isPending &&
                      !draft.discard.isPending
                    }
                    onTitleChange={(name) => draft.patch({ name })}
                    onDescriptionChange={(description) =>
                      draft.patch({ description })
                    }
                    onIconChange={(icon) => draft.patch({ icon: icon || null })}
                    onCoverChange={(cover) =>
                      draft.patch({ cover: cover || null })
                    }
                    onIconPositionChange={(iconPosition) =>
                      draft.patch({ iconPosition })
                    }
                    enableComments={false}
                    workspaceId={workspaceId}
                  />
                </>
              }
            />
          </main>
        }
        mainScrollClassName="overscroll-y-none"
        sidePaneOpen={open}
        sidePaneVisible={open}
        sidePane={
          open ? (
            <AgentSettingsPage
              key={agentId}
              scope={agentId}
              draft={draft}
              agent={agent.data}
              initialTab={search.get("settingsTab")}
              onTabChange={setPanel}
              onClose={() => setPanel(null)}
            />
          ) : null
        }
      />
    </>
  );
}
const noop = () => {};
function AgentChat({
  agentId,
  header,
  beforeComposer,
}: {
  agentId: string;
  header: React.ReactNode;
  beforeComposer: React.ReactNode;
}) {
  const { apiFetch } = useZilobaseFeatures();
  const workspaceId = useActiveWorkspaceId();
  const [sending, setSending] = React.useState(false);
  const abort = React.useRef<AbortController | null>(null);
  const run = useStartCustomAgentRun(agentId);
  const legacy = useCustomAgentLegacyConversations(agentId);
  const conversation = useQuery({
    queryKey: ["custom-agent-chat", workspaceId, agentId],
    queryFn: () =>
      apiFetch<{ messages: CustomAgentConversationMessage[] }>(
        `/api/ai/agents/${encodeURIComponent(agentId)}/conversation`,
        { headers: { "x-zilobase-workspace-id": workspaceId ?? "" } },
      ),
    refetchInterval: 1000,
  });
  const [text, setText] = React.useState("");
  const [model, setModel] = React.useState("auto");
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [, setEntries] = React.useState<ContextAttachMenuEntry[]>([]);
  const models = useWorkspaceAiModels();
  const root = React.useRef<HTMLDivElement>(null);
  const textarea = React.useRef<HTMLTextAreaElement>(null);
  const mention = React.useRef<ContextAttachMenuHandle>(null);
  const seen = React.useRef(new Set<string>());
  const mountedAt = React.useRef(Date.now());
  const messages = React.useMemo(
    () =>
      (conversation.data?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts.map((p) => {
          const part = p as Record<string, unknown>;
          return part.type === "run"
            ? { type: "text", text: String(part.text ?? "Run queued") }
            : part;
        }),
      })) as UIMessage[],
    [conversation.data],
  );
  React.useEffect(() => {
    for (const m of conversation.data?.messages ?? [])
      for (const part of m.parts) {
        const p = part as { type: string; data?: AgentSettingsEvent };
        const id = `${m.id}:${p.data?.status}`;
        if (
          p.type === "data-agent-settings" &&
          new Date(m.createdAt).getTime() >= mountedAt.current &&
          p.data &&
          !seen.current.has(id)
        ) {
          seen.current.add(id);
          emitSettingsEvent(p.data);
        }
      }
  }, [conversation.data]);
  const send = async ({ text: value }: { text: string }) => {
    if (!value.trim() || sending) return;
    try {
      await flushSettingsDrafts();
      setText("");
      setSending(true);
      abort.current = new AbortController();
      const response = await desktopNetworkFetch(
        toApiUrl(
          `/api/ai/agents/${encodeURIComponent(agentId)}/conversation/messages/stream`,
        ),
        {
          method: "POST",
          credentials: "include",
          signal: abort.current.signal,
          headers: getApiRequestHeaders({
            "content-type": "application/json",
            "x-zilobase-workspace-id": workspaceId ?? "",
          }),
          body: JSON.stringify({
            clientId: crypto.randomUUID(),
            message: value,
            modelId: model,
          }),
        },
      );
      if (!response.ok || !response.body)
        throw new Error("Could not send message.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const name = event
            .split("\n")
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
          const raw = event
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (name === "settings") emitSettingsEvent(data);
          if (name === "error") throw new Error(data.error);
        }
      }
      await conversation.refetch();
    } catch (e) {
      if (!abort.current?.signal.aborted) {
        setText(value);
        toast.error(e instanceof Error ? e.message : "Could not send message.");
      }
    } finally {
      setSending(false);
      await conversation.refetch();
    }
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={root}
        data-ai-scroll-shell
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {header}
        <AgentChatLayout>
          {messages.length === 0 && (
            <div className="my-auto py-12 text-center">
              <h2 className="font-heading text-xl font-medium">
                Build this agent through chat
              </h2>
              <p className="mt-2 text-sm text-content-secondary">
                Ask this agent to work or change its settings.
              </p>
            </div>
          )}
          <ChatbotMessages
            applyingToolCallIds={[]}
            feedbackByMessageId={new Map()}
            feedbackReadyMessageIds={new Set()}
            getPageEditBaselineCurrent={() => false}
            getPageEditReviewAvailable={() => false}
            isSidebar={false}
            messages={messages}
            visibleMessages={messages}
            onApplyPageEdit={noop}
            onDiscardPageEdit={noop}
            onRetryIncompleteDatabase={(value) => send({ text: value })}
            onSubmitFeedback={noop}
            onTogglePageEditChanges={noop}
            onUndoPageEdit={noop}
            snapshotByToolCallId={new Map()}
            status={sending ? "submitted" : "ready"}
            threadId={null}
            visibleDiffToolCallId={null}
            workspaceId={workspaceId ?? null}
          />
          {!!legacy.data?.conversations.length && (
            <details className="my-4 text-sm">
              <summary>Private legacy conversations</summary>
              {legacy.data.conversations.map((c) => (
                <div key={c.id}>
                  {c.messages.map((m) => (
                    <p className="whitespace-pre-wrap py-2" key={m.id}>
                      {m.parts
                        .map((p) => String((p as { text?: string }).text ?? ""))
                        .join("\n")}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          )}
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(
                  {},
                  {
                    onSuccess: () => void conversation.refetch(),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Run saved version
            </Button>
          </div>
        </AgentChatLayout>
      </div>
      <AgentChatLayout>
        {beforeComposer}
        <ChatbotComposer
          attachmentsEnabled={false}
          activeMentionQuery=""
          attachments={[]}
          chefs={[...new Set(models.data?.models.map((m) => m.chef) ?? [])]}
          contextError={null}
          createThreadPending={false}
          currentDatabaseId={null}
          currentPageId={null}
          existingAttachmentKeys={new Set()}
          isContextLoading={false}
          isSidebar={false}
          mentionMenuOpen={false}
          mentionMenuRef={mention}
          model={model}
          modelSelectorOpen={selectorOpen}
          models={models.data?.models ?? []}
          onAttachContext={noop}
          onEntriesChange={setEntries}
          onModelSelect={setModel}
          onModelSelectorOpenChange={setSelectorOpen}
          onRemoveAttachment={noop}
          onRemovePrimary={noop}
          onStop={() => abort.current?.abort()}
          onSubmit={send}
          onTextChange={(e) => setText(e.target.value)}
          onTextareaKeyDown={noop}
          pageContextReady={false}
          primaryAttachment={null}
          rootRef={root}
          selectedMentionIndex={mentionIndex}
          selectedModel={models.data?.models.find((m) => m.id === model)}
          setSelectedMentionIndex={setMentionIndex}
          status={sending ? "submitted" : "ready"}
          syncTextCursor={noop}
          text={text}
          textareaRef={textarea}
        />
      </AgentChatLayout>
    </div>
  );
}
