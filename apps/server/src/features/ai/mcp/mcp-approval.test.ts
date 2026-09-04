import { describe, expect, it } from "vitest";

import { dynamicMcpToolName } from "./mcp-approval";

describe("dynamicMcpToolName", () => {
  it("is deterministic, bounded, and connection scoped", () => {
    const snapshot = { externalName: "Create / update issue" };
    const first = dynamicMcpToolName({ id: "connection-a", serverLabel: "Linear" }, snapshot);
    const repeated = dynamicMcpToolName({ id: "connection-a", serverLabel: "Linear" }, snapshot);
    const otherConnection = dynamicMcpToolName({ id: "connection-b", serverLabel: "Linear" }, snapshot);

    expect(first).toBe(repeated);
    expect(first).not.toBe(otherConnection);
    expect(first).toMatch(/^mcp_linear_create_update_issue_[a-z0-9]{7}$/);
    expect(first.length).toBeLessThanOrEqual(120);
  });
});
