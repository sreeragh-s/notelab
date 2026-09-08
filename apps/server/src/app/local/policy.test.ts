import { Hono } from "hono";
import { expect, it } from "vitest";
import { localFeatureGuard } from "./policy";
import type { AppBindings } from "../../shared/types";
it("blocks direct collaboration and provider requests before handlers execute", async () => {
  const app = new Hono<AppBindings>(); let executed = 0;
  app.use("*", localFeatureGuard); app.all("*", c => { executed++; return c.text("allowed"); });
  for (const [method, route] of [["POST", "/api/auth/sign-up/email"], ["PUT", "/pages/p/access"], ["DELETE", "/databases/d/access/public"], ["POST", "/workspaces/w/member-invitations"], ["GET", "/workspaces/w/guests"], ["POST", "/workspaces/w/teamspaces/t/join"], ["GET", "/metadata"], ["DELETE", "/workspaces/w"], ["GET", "/api/ai/mcp/connections"], ["POST", "/api/ai/agents/a/hooks/t"], ["POST", "/api/ai/agents/a/transfer"], ["POST", "/databases/d/automation-slack/oauth/start"], ["PUT", "/api/workspace/settings/ai/providers/openai"]]) {
    const response = await app.request(route!, { method }); expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FEATURE_UNAVAILABLE_LOCAL");
  }
  expect(executed).toBe(0);
  for (const [method, route] of [["GET", "/session"], ["GET", "/workspaces"], ["POST", "/pages"], ["POST", "/pages/p/collaboration-ticket"], ["PUT", "/pages/p/favorite"], ["GET", "/workspaces/w/access-targets"], ["POST", "/databases/d/rows"]]) {
    expect((await app.request(route!, { method })).status).toBe(200);
  }
});
