import { Hono, type Context } from "hono";
import * as z from "zod";

import type { AppBindings } from "../../../shared/types";
import { getCanonicalWebOrigin } from "../../../shared/config/config";
import { getMembership, isPrivilegedOrgRole } from "../../access";
import { MCP_SERVER_CATALOG } from "./catalog";
import { isMcpEnabled } from "./config";
import {
  McpServiceError,
  addApprovedMcpServer,
  createMcpConnection,
  disconnectMcpConnection,
  getWorkspaceMcpPolicy,
  listApprovedMcpServers,
  listMcpActivity,
  listMcpConnections,
  refreshMcpConnection,
  removeApprovedMcpServer,
  setMcpAlwaysAllow,
  submitMcpHeaders,
  toMcpServiceError,
  updateMcpToolPolicies,
  updateWorkspaceMcpPolicy,
} from "./mcp-service";
import { beginMcpOAuth, completeMcpOAuth, getMcpClientMetadata } from "./oauth";

const createConnectionSchema = z.object({
  approvedServerId: z.string().uuid().optional(),
  authMethod: z.enum(["oauth", "headers"]),
  catalogId: z.enum(["github", "linear", "figma"]).optional(),
}).refine((value) => Boolean(value.approvedServerId) !== Boolean(value.catalogId), {
  message: "Choose exactly one catalog or approved server.",
});
const headersSchema = z.object({
  headers: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    value: z.string().min(1).max(8_192),
  })).min(1).max(5),
});
const toolPoliciesSchema = z.object({
  policies: z.array(z.object({
    classification: z.enum(["read", "write", "unknown"]),
    enabled: z.boolean(),
    executionMode: z.enum(["automatic", "always_ask"]),
    toolId: z.string().uuid(),
  })).max(100),
});
const alwaysAllowSchema = z.object({ enabled: z.boolean(), confirmed: z.boolean().default(false) });
const workspacePolicySchema = z.object({
  customServersEnabled: z.boolean(),
  externalWritesEnabled: z.boolean(),
  installationPolicy: z.enum(["approved_and_catalog", "approved_only"]),
});
const approvedServerSchema = z.object({
  endpointUrl: z.string().url().max(2_048),
  label: z.string().trim().min(1).max(120),
});

export const aiMcpRoutes = new Hono<AppBindings>();

aiMcpRoutes.get("/mcp/client-metadata.json", (c) => c.json(getMcpClientMetadata(c.env)));

aiMcpRoutes.get("/mcp/catalog", async (c) => handle(c, async (auth) => {
  const policy = await getWorkspaceMcpPolicy(auth.workspaceId);
  return {
    catalog: MCP_SERVER_CATALOG.map((entry) => ({
      ...entry,
      available: entry.available && policy.installationPolicy !== "approved_only",
      availabilityReason: policy.installationPolicy === "approved_only"
        ? "Workspace policy requires an explicitly approved server."
        : entry.availabilityReason,
    })),
  };
}));

aiMcpRoutes.get("/mcp/policy", async (c) => handleAdmin(c, async (auth) => ({
  approvedServers: await listApprovedMcpServers(auth.workspaceId),
  policy: await getWorkspaceMcpPolicy(auth.workspaceId),
})));

aiMcpRoutes.get("/mcp/approved-servers", async (c) => handle(c, async (auth) => ({
  approvedServers: (await listApprovedMcpServers(auth.workspaceId)).map((server) => ({
    endpointUrl: server.endpointUrl,
    id: server.id,
    label: server.label,
  })),
})));

aiMcpRoutes.put("/mcp/policy", async (c) => handleAdmin(c, async (auth) => ({
  policy: await updateWorkspaceMcpPolicy({ ...workspacePolicySchema.parse(await c.req.json()), workspaceId: auth.workspaceId }),
})));

aiMcpRoutes.post("/mcp/approved-servers", async (c) => handleAdmin(c, async (auth) => ({
  server: await addApprovedMcpServer({ ...approvedServerSchema.parse(await c.req.json()), ...auth }),
}), 201));

aiMcpRoutes.delete("/mcp/approved-servers/:serverId", async (c) => handleAdmin(c, async (auth) => ({
  removed: await removeApprovedMcpServer({ serverId: c.req.param("serverId"), workspaceId: auth.workspaceId }),
})));

aiMcpRoutes.get("/agents/:agentId/connections", async (c) => handle(c, async (auth) => ({
  connections: await listMcpConnections({ ...auth, agentProfileId: c.req.param("agentId") }),
})));

aiMcpRoutes.post("/agents/:agentId/connections", async (c) => handle(c, async (auth) => ({
  connection: await createMcpConnection({
    ...createConnectionSchema.parse(await c.req.json()),
    ...auth,
    agentProfileId: c.req.param("agentId"),
    env: c.env,
  }),
}), 201));

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/headers", async (c) => handle(c, async (auth) => ({
  connection: await submitMcpHeaders({
    ...headersSchema.parse(await c.req.json()),
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
    env: c.env,
  }),
})));

aiMcpRoutes.post("/agents/:agentId/connections/:connectionId/oauth/start", async (c) => handle(c, async (auth) => {
  const result = await beginMcpOAuth({
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
    env: c.env,
  });
  return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt.toISOString() };
}));

aiMcpRoutes.get("/mcp/oauth/callback", async (c) => {
  if (!isMcpEnabled(c.env)) return c.json({ error: "MCP is disabled." }, 404);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.json({ error: "OAuth callback is missing code or state." }, 400);
  try {
    const connection = await completeMcpOAuth({ code, env: c.env, iss: c.req.query("iss"), state });
    const target = new URL("/settings/zilobase-ai", getCanonicalWebOrigin(c.env));
    target.searchParams.set("agent", connection.agentProfileId);
    target.searchParams.set("mcp", "connected");
    return c.redirect(target.toString(), 302);
  } catch (error) {
    const target = new URL("/settings/zilobase-ai", getCanonicalWebOrigin(c.env));
    target.searchParams.set("mcp", "failed");
    return c.redirect(target.toString(), 302);
  }
});

aiMcpRoutes.post("/agents/:agentId/connections/:connectionId/refresh", async (c) => handle(c, async (auth) => (
  await refreshMcpConnection({
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
    env: c.env,
  })
)));

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/tools", async (c) => handle(c, async (auth) => ({
  connection: await updateMcpToolPolicies({
    ...toolPoliciesSchema.parse(await c.req.json()),
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
  }),
})));

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/always-allow", async (c) => handle(c, async (auth) => ({
  connection: await setMcpAlwaysAllow({
    ...alwaysAllowSchema.parse(await c.req.json()),
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
  }),
})));

aiMcpRoutes.delete("/agents/:agentId/connections/:connectionId", async (c) => handle(c, async (auth) => ({
  disconnected: await disconnectMcpConnection({
    ...auth,
    agentProfileId: c.req.param("agentId"),
    connectionId: c.req.param("connectionId"),
    env: c.env,
  }),
})));

aiMcpRoutes.get("/agents/:agentId/activity", async (c) => handle(c, async (auth) => ({
  activity: await listMcpActivity({ ...auth, agentProfileId: c.req.param("agentId") }),
})));

async function handleAdmin(
  c: Context<AppBindings>,
  action: (auth: { userId: string; workspaceId: string }) => Promise<unknown>,
  status: 200 | 201 = 200,
) {
  return handle(c, async (auth, membership) => {
    if (!isPrivilegedOrgRole(membership.role)) {
      throw new McpServiceError("workspace_admin_required", "Only workspace admins can manage MCP policy.", 403);
    }
    return action(auth);
  }, status);
}

async function handle(
  c: Context<AppBindings>,
  action: (
    auth: { userId: string; workspaceId: string },
    membership: NonNullable<Awaited<ReturnType<typeof getMembership>>>,
  ) => Promise<unknown>,
  successStatus: 200 | 201 = 200,
) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = c.get("session")?.activeWorkspaceId ?? c.req.header("x-zilobase-workspace-id")?.trim();
  if (!workspaceId) return c.json({ error: "No active workspace" }, 409);
  const membership = await getMembership(workspaceId, user.id);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  if (!isMcpEnabled(c.env)) return c.json({ code: "AI_MCP_DISABLED", error: "MCP is disabled." }, 404);
  try {
    return c.json(await action({ userId: user.id, workspaceId }, membership), successStatus);
  } catch (error) {
    const serviceError = toMcpServiceError(error);
    if (serviceError) return c.json({ code: serviceError.code, error: serviceError.message }, serviceError.status);
    if (error instanceof z.ZodError) {
      return c.json({ code: "VALIDATION_ERROR", error: "Invalid request body", issues: error.issues }, 400);
    }
    throw error;
  }
}
