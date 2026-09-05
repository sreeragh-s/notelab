import { describe, expect, it } from "vitest";
import { mcpOAuthReturnUrl } from "./oauth-return";

describe("MCP OAuth return routing", () => {
  it.each(["connected", "failed"] as const)(
    "restores personal settings after %s",
    (outcome) => {
      const url = new URL(
        mcpOAuthReturnUrl("https://app.example", { type: "personal" }, outcome),
      );
      expect(url.pathname).toBe("/ai");
      expect(url.searchParams.get("settingsTab")).toBe("connectors");
      expect(url.searchParams.get("mcp")).toBe(outcome);
    },
  );
  it.each(["connected", "failed"] as const)(
    "restores standalone agent tools after %s",
    (outcome) => {
      const url = new URL(
        mcpOAuthReturnUrl(
          "https://app.example",
          { type: "agent", agentProfileId: "agent-id" },
          outcome,
        ),
      );
      expect(url.pathname).toBe("/agents/agent-id");
      expect(url.searchParams.get("settingsTab")).toBe("tools");
      expect(url.searchParams.has("agent")).toBe(false);
    },
  );
  it("does not turn a stored identifier into an external redirect", () => {
    const url = new URL(
      mcpOAuthReturnUrl(
        "https://app.example",
        { type: "agent", agentProfileId: "//attacker.example/?secret" },
        "connected",
      ),
    );
    expect(url.origin).toBe("https://app.example");
    expect(url.searchParams.has("secret")).toBe(false);
  });
});
