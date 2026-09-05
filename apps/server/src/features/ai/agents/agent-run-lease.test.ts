import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const database = vi.hoisted(() => ({ returning: vi.fn() }));
vi.mock("../../../infrastructure/database", () => ({
  db: { update: () => ({ set: () => ({ where: () => ({ returning: database.returning }) }) }) },
}));

import { AGENT_RUN_LEASE_MS, maintainAgentRunLease } from "./agent-run-lease";

describe("Custom Agent execution lease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    database.returning.mockReset().mockResolvedValue([{ id: "run" }]);
  });
  afterEach(() => vi.useRealTimers());

  it("renews during long model calls and stops renewal on completion", async () => {
    const lease = maintainAgentRunLease("run", "worker");
    await vi.advanceTimersByTimeAsync(AGENT_RUN_LEASE_MS * 2);
    expect(database.returning).toHaveBeenCalledTimes(6);
    await lease.stop();
    await vi.advanceTimersByTimeAsync(AGENT_RUN_LEASE_MS);
    expect(database.returning).toHaveBeenCalledTimes(6);
  });

  it("aborts model work when cancellation or another worker invalidates the lease", async () => {
    database.returning.mockResolvedValue([]);
    const lease = maintainAgentRunLease("run", "worker");
    await vi.advanceTimersByTimeAsync(AGENT_RUN_LEASE_MS / 3);
    expect(lease.signal.aborted).toBe(true);
    await lease.stop();
  });

  it("checks durable ownership before invoking a tool", async () => {
    const execute = vi.fn().mockResolvedValue("done");
    const lease = maintainAgentRunLease("run", "worker");
    const tools = lease.guardTools({ action: { execute, inputSchema: z.object({}) } });
    const options = { messages: [], toolCallId: "call" };
    await expect(tools.action!.execute!({}, options)).resolves.toBe("done");
    database.returning.mockResolvedValue([]);
    await expect(tools.action!.execute!({}, options)).rejects.toThrow("no longer active");
    expect(execute).toHaveBeenCalledTimes(1);
    await lease.stop();
  });

  it("fails closed on database renewal errors", async () => {
    database.returning.mockRejectedValue(new Error("database unavailable"));
    const lease = maintainAgentRunLease("run", "worker");
    await vi.advanceTimersByTimeAsync(AGENT_RUN_LEASE_MS / 3);
    expect(lease.signal.aborted).toBe(true);
    await lease.stop();
  });
});
