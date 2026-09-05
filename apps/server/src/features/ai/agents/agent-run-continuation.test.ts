import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { processAgentRun } from "./agent-run-service";

const state = vi.hoisted(() => ({
  run: {} as Record<string, unknown>,
  checkpoint: { messages: [], steps: 0, toolCallIds: [] } as Record<
    string,
    unknown
  >,
  writes: [] as { toolCallId: string }[],
  ambiguous: false,
  missingProfile: false,
  resources: [] as { eligibleEditorCount: number }[],
  generate: vi.fn(),
  saves: vi.fn(),
  events: vi.fn(),
  dispatch: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: state.generate,
}));
vi.mock("./agent-run-records", () => ({ appendRunEvent: state.events }));
vi.mock("./agent-run-lease", () => ({
  AGENT_RUN_LEASE_MS: 60_000,
  maintainAgentRunLease: () => ({
    signal: new AbortController().signal,
    guardTools: (tools: unknown) => tools,
    stop: state.stop,
  }),
}));
vi.mock("./agent-resource-service", () => ({
  listAgentResourcesForExecution: async () => state.resources,
}));
vi.mock("./agent-native-run-tools", () => ({
  buildAgentNativeRunTools: () => ({}),
}));
vi.mock("../mcp/mcp-run-tools", () => ({
  buildMcpAgentRunTools: async () => ({ tools: {} }),
}));
vi.mock("../providers/ai-provider", () => ({
  resolveWorkspaceAiModel: async () => ({ model: "model" }),
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: state.dispatch,
}));
vi.mock("./agent-run-checkpoint", async (original) => ({
  ...(await original<typeof import("./agent-run-checkpoint")>()),
  readAgentRunCheckpoint: async () => state.checkpoint,
  saveAgentRunCheckpoint: state.saves,
}));
vi.mock("../../../infrastructure/database", () => {
  const rows = (
    table: Parameters<typeof getTableName>[0],
    selection?: Record<string, unknown>,
  ) => {
    switch (getTableName(table)) {
      case "ai_agent_run":
        return [state.run];
      case "ai_agent_revision":
        return [{ compiledDefinition: { instructions: "Saved instructions" } }];
      case "ai_agent_profile":
        return state.missingProfile ? [] : [{ name: "Agent" }];
      case "ai_agent_tool_execution":
        return selection?.toolCallId
          ? state.writes
          : state.ambiguous
            ? [{ id: "receipt" }]
            : [];
      default:
        return [];
    }
  };
  const database = {
    select: (selection?: Record<string, unknown>) => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: () => {
          const query = {
            limit: () => query,
            for: async () =>
              state.run.status === "queued" ? rows(table, selection) : [],
            then: (resolve: (value: unknown) => unknown) =>
              resolve(rows(table, selection)),
          };
          return query;
        },
      }),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          if (getTableName(table) === "ai_agent_run")
            Object.assign(state.run, value);
          return {
            returning: async () => [state.run],
            then: (resolve: (value: unknown) => unknown) => resolve([]),
          };
        },
      }),
    }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
      callback(database),
  };
  return { db: database };
});

const env = { AI_CUSTOM_AGENTS_ENABLED: "true" };
const work = { runId: "run", workerId: "worker" };
const result = {
  text: "Final answer",
  usage: { inputTokens: 10, outputTokens: 5 },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.run = {
    id: "run",
    profileId: "agent",
    workspaceId: "workspace",
    revisionId: "revision",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    input: { prompt: "Do the work" },
    permissionSnapshot: { resources: [] },
  };
  state.checkpoint = { version: 1, messages: [], steps: 0, toolCallIds: [] };
  state.writes = [];
  state.resources = [];
  state.ambiguous = false;
  state.missingProfile = false;
  state.saves.mockResolvedValue(false);
  state.generate.mockResolvedValue(result);
});

describe("agent model continuation", () => {
  it("completes a fresh run and publishes its final answer", async () => {
    expect((await processAgentRun(env, work)).outcome).toBe("completed");
    expect(state.run.status).toBe("succeeded");
    expect(state.events).toHaveBeenCalledWith("run", "output", "shared", {
      text: "Final answer",
    });
    expect(state.stop).toHaveBeenCalled();
  });
  it("passes checkpointed results back to the model instead of replaying tools", async () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "prior",
            toolName: "write",
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
    ];
    state.checkpoint = {
      version: 1,
      steps: 2,
      toolCallIds: ["prior"],
      messages,
    };
    state.run.attempts = 1;
    state.writes = [{ toolCallId: "prior" }];
    expect((await processAgentRun(env, work)).outcome).toBe("completed");
    expect(state.generate.mock.calls[0]![0].messages).toEqual([
      { role: "user", content: "Do the work" },
      ...messages,
    ]);
  });
  it("does not replay an uncheckpointed write after a crash", async () => {
    state.run.attempts = 1;
    state.writes = [{ toolCallId: "uncheckpointed" }];
    expect((await processAgentRun(env, work)).outcome).toBe("terminal");
    expect(state.run.errorCode).toBe("AGENT_RETRY_REQUIRES_REVIEW");
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("publishes a checkpointed final result without another model call", async () => {
    state.checkpoint.finalResult = result;
    expect((await processAgentRun(env, work)).outcome).toBe("completed");
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("pauses after persisting the model step containing approvals", async () => {
    state.generate.mockImplementationOnce(async (options) => {
      state.saves.mockImplementationOnce(async () => {
        state.run.status = "waiting_approval";
        return true;
      });
      await options.onStepFinish({
        response: { messages: [] },
        toolCalls: [{ toolCallId: "approval" }],
        usage: {},
        text: "",
      });
      expect(options.stopWhen[1]()).toBe(true);
      return result;
    });
    expect((await processAgentRun(env, work)).outcome).toBe("completed");
    expect(state.run.status).toBe("waiting_approval");
    expect(state.run.leaseOwner).toBeNull();
    expect(state.events.mock.calls.some((call) => call[1] === "output")).toBe(
      false,
    );
  });
  it("fails safely when the saved revision is unavailable", async () => {
    state.missingProfile = true;
    expect((await processAgentRun(env, work)).outcome).toBe("terminal");
    expect(state.run.errorCode).toBe("AGENT_REVISION_UNAVAILABLE");
  });
  it("pauses when all resource editors lose access", async () => {
    state.resources = [{ eligibleEditorCount: 0 }];
    expect((await processAgentRun(env, work)).outcome).toBe("terminal");
    expect(state.run.errorCode).toBe("AGENT_ACCESS_PAUSED");
  });
  it("bounds the total model steps across approvals", async () => {
    state.checkpoint.steps = 15;
    expect((await processAgentRun(env, work)).outcome).toBe("terminal");
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("retries transient model failures without writes", async () => {
    state.generate.mockRejectedValueOnce(new Error("Provider unavailable"));
    expect((await processAgentRun(env, work)).outcome).toBe("retry");
    expect(state.run.status).toBe("queued");
    expect(state.dispatch).toHaveBeenCalledTimes(1);
  });
  it("does not retry ambiguous writes", async () => {
    state.ambiguous = true;
    expect((await processAgentRun(env, work)).outcome).toBe("terminal");
    expect(state.run.errorCode).toBe("AGENT_WRITE_OUTCOME_UNKNOWN");
  });
  it("does not overwrite cancellation when the provider rejects", async () => {
    state.generate.mockImplementationOnce(async () => {
      state.run.status = "cancelled";
      state.run.leaseOwner = null;
      throw new Error("aborted");
    });
    expect((await processAgentRun(env, work)).outcome).toBe("noop");
    expect(state.run.status).toBe("cancelled");
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
