import { Hono, type Context } from "hono";
import * as z from "zod";

import type { AppBindings } from "../../../shared/types";
import { getStringEnv } from "../../../shared/config/config";
import { getMembership } from "../../access";
import {
  AgentProfileError,
  archiveAgentProfile,
  createAgentProfile,
  getAgentProfileDetail,
  listAccessibleAgentProfiles,
  replaceAgentProfileAccess,
  transferAgentProfileOwnership,
  updateAgentProfile,
} from "./agent-profile-service";

const createSchema = z.object({
  defaultModel: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.unknown().optional(),
  instructions: z.string().max(20_000).optional(),
  name: z.string().trim().min(1).max(120),
});
const updateSchema = createSchema.partial();
const accessSchema = z.object({
  grants: z.array(z.object({
    principalId: z.string().trim().min(1).max(160),
    principalType: z.enum(["user", "team"]),
    role: z.enum(["editor", "user"]),
  })).max(200),
});
const transferSchema = z.object({ newOwnerUserId: z.string().trim().min(1).max(160) });

export const aiAgentProfileRoutes = new Hono<AppBindings>();

aiAgentProfileRoutes.get("/agents", async (c) => handle(c, async (auth) => ({
  agents: await listAccessibleAgentProfiles(auth),
})));

aiAgentProfileRoutes.post("/agents", async (c) => handle(c, async (auth) => {
  const body = createSchema.parse(await c.req.json());
  return { agent: await createAgentProfile({ ...body, ownerUserId: auth.userId, workspaceId: auth.workspaceId }) };
}, 201));

aiAgentProfileRoutes.get("/agents/:agentId", async (c) => handle(c, async (auth) => {
  const agent = await getAgentProfileDetail({ ...auth, profileId: c.req.param("agentId") });
  if (!agent) throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
  return { agent };
}));

aiAgentProfileRoutes.patch("/agents/:agentId", async (c) => handle(c, async (auth) => {
  const body = updateSchema.parse(await c.req.json());
  return { agent: await updateAgentProfile({ ...auth, ...body, profileId: c.req.param("agentId") }) };
}));

aiAgentProfileRoutes.put("/agents/:agentId/access", async (c) => handle(c, async (auth) => {
  const body = accessSchema.parse(await c.req.json());
  return { agent: await replaceAgentProfileAccess({ ...auth, ...body, profileId: c.req.param("agentId") }) };
}));

aiAgentProfileRoutes.post("/agents/:agentId/transfer", async (c) => handle(c, async (auth) => {
  const body = transferSchema.parse(await c.req.json());
  return { agent: await transferAgentProfileOwnership({ ...auth, ...body, profileId: c.req.param("agentId") }) };
}));

aiAgentProfileRoutes.post("/agents/:agentId/archive", async (c) => handle(c, async (auth) => ({
  result: await archiveAgentProfile({ ...auth, profileId: c.req.param("agentId") }),
})));

async function handle(
  c: Context<AppBindings>,
  action: (auth: { userId: string; workspaceId: string }) => Promise<unknown>,
  successStatus: 200 | 201 = 200,
) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.get("session")?.activeWorkspaceId ?? c.req.header("x-zilobase-workspace-id")?.trim();
  if (!workspaceId) return c.json({ error: "No active workspace" }, 409);
  if (!(await getMembership(workspaceId, user.id))) return c.json({ error: "Forbidden" }, 403);
  if (getStringEnv(c.env, "AI_MCP_ENABLED") !== "true") {
    return c.json({ code: "AI_MCP_DISABLED", error: "Custom agents and MCP connections are disabled." }, 404);
  }
  try {
    const result = await action({ userId: user.id, workspaceId });
    return c.json(result, successStatus);
  } catch (error) {
    if (error instanceof AgentProfileError) {
      return c.json({ code: error.code, error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return c.json({ code: "VALIDATION_ERROR", error: "Invalid request body", issues: error.issues }, 400);
    }
    throw error;
  }
}
