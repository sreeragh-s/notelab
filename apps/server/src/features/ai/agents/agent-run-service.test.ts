import { describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("../../../infrastructure/database", () => ({ db: { transaction } }));

import { processAgentRun } from "./agent-run-service";

describe("durable agent deployment gates", () => {
  it.each([
    {},
    { AI_CUSTOM_AGENTS_ENABLED: "false" },
    { AI_CUSTOM_AGENTS_ENABLED: "true", AI_CUSTOM_AGENT_EXECUTION_DISABLED: "true" },
  ])("does not claim queued jobs while execution is disabled: %j", async (env) => {
    const result = await processAgentRun(env, { runId: "run", workerId: "worker" });
    expect(result.outcome).toBe("retry");
    expect(transaction).not.toHaveBeenCalled();
  });
});
