import type { AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  aiAgentPendingAction,
  aiAgentToolExecution,
  aiAgentTurn,
  aiMcpConnection,
  aiMcpToolSnapshot,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getMembership } from "../../access";
import { hashAgentToolInput } from "../actions/agent-action-receipts";
import { requireAgentProfileRole } from "../agents/agent-profile-service";
import { decryptMcpSecret, encryptMcpSecret } from "./credential-crypto";
import { isMcpExternalWritesEnabled } from "./config";
import { discoverConnectionTools, executeMcpTool } from "./mcp-client";
import { getWorkspaceMcpPolicy } from "./mcp-service";

const APPROVAL_TTL_MS = 15 * 60 * 1_000;

export async function requestMcpActionApproval(input: {
  agentProfileId: string;
  connection: typeof aiMcpConnection.$inferSelect;
  env: RuntimeEnv;
  snapshot: typeof aiMcpToolSnapshot.$inferSelect;
  threadId: string;
  toolCallId: string;
  toolInput: unknown;
  userId: string;
  workspaceId: string;
}): Promise<AgentToolResult> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  const inputHash = await hashAgentToolInput(input.toolInput);
  const encrypted = await encryptMcpSecret(input.env, JSON.stringify(input.toolInput), {
    authenticatedByUserId: input.connection.authenticatedByUserId,
    connectionId: input.connection.id,
    profileId: input.agentProfileId,
    purpose: `approval:${id}`,
    workspaceId: input.workspaceId,
  });
  await db.insert(aiAgentPendingAction).values({
    agentProfileId: input.agentProfileId,
    connectionId: input.connection.id,
    createdAt: now,
    encryptedToolInput: `${encrypted.keyVersion}:${encrypted.ciphertext}`,
    encryptedToolInputAuthTag: encrypted.authTag,
    encryptedToolInputIv: encrypted.iv,
    expiresAt,
    externalToolName: input.snapshot.externalName,
    id,
    inputHash,
    status: "pending",
    threadId: input.threadId,
    toolCallId: input.toolCallId,
    toolInput: {},
    toolName: dynamicMcpToolName(input.connection, input.snapshot),
    toolSchemaHash: input.snapshot.schemaHash,
    toolVersion: 1,
    updatedAt: now,
    userId: input.userId,
    workspaceId: input.workspaceId,
  }).onConflictDoNothing({
    target: [aiAgentPendingAction.threadId, aiAgentPendingAction.toolCallId],
  });
  const [persisted] = await db.select().from(aiAgentPendingAction).where(and(
    eq(aiAgentPendingAction.threadId, input.threadId),
    eq(aiAgentPendingAction.toolCallId, input.toolCallId),
  )).limit(1);
  if (!persisted || persisted.inputHash !== inputHash || persisted.connectionId !== input.connection.id) {
    throw new Error("MCP approval request idempotency conflict.");
  }
  return {
    data: {
      approval: {
        actionId: persisted.id,
        expiresAt: persisted.expiresAt.toISOString(),
        provider: input.connection.serverLabel,
        title: input.snapshot.externalName,
        toolName: persisted.toolName,
      },
    },
    ok: false,
    status: "approval_required",
    summary: `${input.connection.serverLabel}: ${input.snapshot.externalName} requires your approval before it can run.`,
  };
}

export async function executeApprovedMcpAction(input: {
  action: typeof aiAgentPendingAction.$inferSelect;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  const action = input.action;
  if (
    !action.agentProfileId || !action.connectionId || !action.externalToolName ||
    !action.toolSchemaHash || !action.encryptedToolInput ||
    !action.encryptedToolInputIv || !action.encryptedToolInputAuthTag
  ) {
    throw new Error("MCP approval payload is incomplete.");
  }
  await requireAgentProfileRole({
    minimum: "user",
    profileId: action.agentProfileId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  await discoverConnectionTools({ connectionId: action.connectionId, env: input.env });
  const [context] = await db.select({
    connection: aiMcpConnection,
    snapshot: aiMcpToolSnapshot,
  }).from(aiMcpConnection).innerJoin(
    aiMcpToolSnapshot,
    and(
      eq(aiMcpToolSnapshot.connectionId, aiMcpConnection.id),
      eq(aiMcpToolSnapshot.externalName, action.externalToolName),
    ),
  ).where(and(
    eq(aiMcpConnection.id, action.connectionId),
    eq(aiMcpConnection.agentProfileId, action.agentProfileId),
    eq(aiMcpConnection.workspaceId, input.workspaceId),
  )).limit(1);
  if (
    !context || context.connection.state !== "connected" ||
    !context.snapshot.enabled || !context.snapshot.available ||
    context.snapshot.schemaHash !== action.toolSchemaHash
  ) {
    throw new Error("MCP tool or connection changed after approval was requested.");
  }
  if (!(await getMembership(input.workspaceId, context.connection.authenticatedByUserId))) {
    throw new Error("MCP connection authenticator is no longer active.");
  }
  const policy = await getWorkspaceMcpPolicy(input.workspaceId);
  if (
    context.snapshot.classification !== "read" &&
    (!policy.externalWritesEnabled || !isMcpExternalWritesEnabled(input.env))
  ) {
    throw new Error("External writes are disabled for this workspace.");
  }
  const [keyVersion, ciphertext] = splitEncryptedPayload(action.encryptedToolInput);
  const plaintext = await decryptMcpSecret(input.env, {
    authTag: action.encryptedToolInputAuthTag,
    ciphertext,
    iv: action.encryptedToolInputIv,
    keyVersion,
  }, {
    authenticatedByUserId: context.connection.authenticatedByUserId,
    connectionId: context.connection.id,
    profileId: action.agentProfileId,
    purpose: `approval:${action.id}`,
    workspaceId: input.workspaceId,
  });
  const toolInput = JSON.parse(plaintext) as unknown;
  if (await hashAgentToolInput(toolInput) !== action.inputHash) {
    throw new Error("MCP approval arguments failed integrity validation.");
  }
  const [toolExecution] = await db.select({ id: aiAgentToolExecution.id })
    .from(aiAgentToolExecution)
    .where(and(
      eq(aiAgentToolExecution.toolCallId, action.toolCallId),
      sql`exists (
        select 1 from ${aiAgentTurn}
        where ${aiAgentTurn.id} = ${aiAgentToolExecution.turnId}
          and ${aiAgentTurn.threadId} = ${action.threadId}
      )`,
    ))
    .limit(1);
  const result = await executeMcpTool({
    agentProfileId: action.agentProfileId,
    connectionId: context.connection.id,
    env: input.env,
    externalName: context.snapshot.externalName,
    schemaHash: context.snapshot.schemaHash,
    threadId: action.threadId,
    toolInput,
    toolExecutionId: toolExecution?.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const outcomeUnknown = result.error?.code === "mcp_write_outcome_unknown";
  const succeeded = result.ok && result.status === "succeeded";
  await db.update(aiAgentToolExecution).set({
    approvalActorUserId: input.userId,
    completedAt: new Date(),
    errorCode: succeeded ? null : result.error?.code ?? "mcp_approved_action_failed",
    outcomeUnknown,
    status: succeeded ? "succeeded" : "failed",
    updatedAt: new Date(),
  }).where(and(
    eq(aiAgentToolExecution.toolCallId, action.toolCallId),
    sql`exists (
      select 1 from ${aiAgentTurn}
      where ${aiAgentTurn.id} = ${aiAgentToolExecution.turnId}
        and ${aiAgentTurn.threadId} = ${action.threadId}
    )`,
  ));
  return result;
}

export function isMcpPendingAction(action: typeof aiAgentPendingAction.$inferSelect) {
  return Boolean(action.connectionId && action.externalToolName && action.agentProfileId);
}

export function dynamicMcpToolName(
  connection: Pick<typeof aiMcpConnection.$inferSelect, "id" | "serverLabel">,
  snapshot: Pick<typeof aiMcpToolSnapshot.$inferSelect, "externalName">,
) {
  return `mcp_${slug(connection.serverLabel)}_${slug(snapshot.externalName)}_${shortHash(`${connection.id}:${snapshot.externalName}`)}`
    .slice(0, 120);
}

function splitEncryptedPayload(value: string) {
  const index = value.indexOf(":");
  if (index <= 0) throw new Error("Encrypted approval payload is invalid.");
  return [value.slice(0, index), value.slice(index + 1)] as const;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "tool";
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}
