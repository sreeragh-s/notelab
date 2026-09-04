import { describe, expect, it } from "vitest";

import {
  McpEgressError,
  normalizeMcpEndpoint,
  resolvePublicMcpTarget,
  validateMcpCustomHeaderName,
} from "./secure-egress";

describe("MCP secure egress", () => {
  it("normalizes exact HTTPS endpoints and rejects URL-carried secrets", () => {
    expect(normalizeMcpEndpoint("https://MCP.Example.com:443/rpc")).toBe(
      "https://mcp.example.com/rpc",
    );
    for (const url of [
      "http://mcp.example.com/rpc",
      "https://user:pass@mcp.example.com/rpc",
      "https://mcp.example.com/rpc?token=secret",
      "https://mcp.example.com/rpc#fragment",
    ]) {
      expect(() => normalizeMcpEndpoint(url), url).toThrow(McpEgressError);
    }
  });

  it("rejects local destinations and mixed public/private DNS answers", async () => {
    for (const hostname of ["localhost", "service.internal", "127.0.0.1", "[::1]"]) {
      await expect(resolvePublicMcpTarget(`https://${hostname}/mcp`)).rejects.toMatchObject({
        code: "mcp_private_destination",
      });
    }
    await expect(resolvePublicMcpTarget("https://mcp.example.com/rpc", async () => [
      "93.184.216.34",
      "169.254.169.254",
    ])).rejects.toMatchObject({ code: "mcp_private_destination" });
  });

  it("uses a stable validated address and rejects reserved custom headers", async () => {
    await expect(resolvePublicMcpTarget("https://mcp.example.com/rpc", async () => [
      "93.184.216.35",
      "93.184.216.34",
    ])).resolves.toMatchObject({ pinnedAddress: "93.184.216.34" });

    expect(validateMcpCustomHeaderName("X-Provider-Key")).toBe("x-provider-key");
    for (const header of [
      "Host",
      "Cookie",
      "Content-Length",
      "Forwarded",
      "X-Forwarded-For",
      "Mcp-Session-Id",
      "Sec-Fetch-Site",
    ]) {
      expect(() => validateMcpCustomHeaderName(header), header).toThrow(McpEgressError);
    }
  });
});
