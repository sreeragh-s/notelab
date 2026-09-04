import type {
  AiAgentProfileDetail,
  AiAgentProfileRole,
  AiAgentProfileSummary,
  McpConnectionSummary,
} from "@zilobase/features/ai-chat/mcp-contract";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  aiAgentProfile,
  aiAgentProfileAccess,
  aiChatThread,
  aiMcpConnection,
  member,
  team,
  teamMember,
} from "../../../infrastructure/database/schema";
import { activeMembershipCondition } from "../../memberships";

const ROLE_RANK: Record<AiAgentProfileRole, number> = {
  user: 1,
  editor: 2,
  owner: 3,
};

export class AgentProfileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "AgentProfileError";
  }
}

export async function listAccessibleAgentProfiles(input: {
  userId: string;
  workspaceId: string;
}) {
  const profiles = await db
    .select()
    .from(aiAgentProfile)
    .where(and(
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
      or(
        eq(aiAgentProfile.ownerUserId, input.userId),
        sql`exists (
          select 1 from ${aiAgentProfileAccess} access
          where access.profile_id = ${aiAgentProfile.id}
            and (
              (access.principal_type = 'user' and access.principal_id = ${input.userId})
              or (access.principal_type = 'team' and exists (
                select 1 from ${teamMember} tm
                inner join ${team} t on t.id = tm.team_id
                where tm.team_id = access.principal_id
                  and tm.user_id = ${input.userId}
                  and t.workspace_id = ${input.workspaceId}
              ))
            )
        )`,
      ),
    ))
    .orderBy(desc(aiAgentProfile.updatedAt), desc(aiAgentProfile.id));

  return Promise.all(profiles.map(async (profile) =>
    serializeProfileSummary(profile, await getAgentProfileRole({
      profileId: profile.id,
      userId: input.userId,
      workspaceId: input.workspaceId,
    }) ?? "user")));
}

export async function createAgentProfile(input: {
  defaultModel?: string;
  description?: string;
  icon?: unknown;
  instructions?: string;
  name: string;
  ownerUserId: string;
  workspaceId: string;
}) {
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(aiAgentProfile).values({
    createdAt: now,
    defaultModel: input.defaultModel ?? "auto",
    description: input.description ?? "",
    icon: input.icon,
    id,
    instructions: input.instructions ?? "",
    name: input.name,
    ownerUserId: input.ownerUserId,
    status: "active",
    updatedAt: now,
    version: 1,
    workspaceId: input.workspaceId,
  });
  return getAgentProfileDetail({
    profileId: id,
    userId: input.ownerUserId,
    workspaceId: input.workspaceId,
  });
}

export async function getAgentProfileRole(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}): Promise<AiAgentProfileRole | null> {
  const [profile] = await db
    .select({ ownerUserId: aiAgentProfile.ownerUserId })
    .from(aiAgentProfile)
    .where(and(
      eq(aiAgentProfile.id, input.profileId),
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
    ))
    .limit(1);
  if (!profile) return null;
  if (profile.ownerUserId === input.userId) return "owner";

  const grants = await db
    .select({ role: aiAgentProfileAccess.role })
    .from(aiAgentProfileAccess)
    .where(and(
      eq(aiAgentProfileAccess.profileId, input.profileId),
      or(
        and(
          eq(aiAgentProfileAccess.principalType, "user"),
          eq(aiAgentProfileAccess.principalId, input.userId),
        ),
        and(
          eq(aiAgentProfileAccess.principalType, "team"),
          sql`exists (
            select 1 from ${teamMember} tm
            inner join ${team} t on t.id = tm.team_id
            where tm.team_id = ${aiAgentProfileAccess.principalId}
              and tm.user_id = ${input.userId}
              and t.workspace_id = ${input.workspaceId}
          )`,
        ),
      ),
    ));

  return grants.reduce<AiAgentProfileRole | null>((best, grant) => {
    const role = grant.role === "editor" ? "editor" : "user";
    return !best || ROLE_RANK[role] > ROLE_RANK[best] ? role : best;
  }, null);
}

export async function requireAgentProfileRole(input: {
  minimum: AiAgentProfileRole;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  const role = await getAgentProfileRole(input);
  if (!role) throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
  if (ROLE_RANK[role] < ROLE_RANK[input.minimum]) {
    throw new AgentProfileError("agent_forbidden", "You do not have permission to manage this agent.", 403);
  }
  return role;
}

export async function getAgentProfileDetail(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}): Promise<AiAgentProfileDetail | null> {
  const role = await getAgentProfileRole(input);
  if (!role) return null;
  const [profile] = await db.select().from(aiAgentProfile).where(and(
    eq(aiAgentProfile.id, input.profileId),
    eq(aiAgentProfile.workspaceId, input.workspaceId),
  )).limit(1);
  if (!profile) return null;
  const [access, connections] = await Promise.all([
    db.select().from(aiAgentProfileAccess).where(
      eq(aiAgentProfileAccess.profileId, input.profileId),
    ),
    db.select().from(aiMcpConnection).where(and(
      eq(aiMcpConnection.scopeType, "agent"),
      eq(aiMcpConnection.agentProfileId, input.profileId),
    )),
  ]);
  return {
    ...serializeProfileSummary(profile, role),
    instructions: profile.instructions,
    access: access.map((grant) => ({
      id: grant.id,
      principalId: grant.principalId,
      principalType: grant.principalType as "user" | "team",
      role: grant.role as "editor" | "user",
    })),
    connections: connections.map(serializeConnection),
  };
}

export async function updateAgentProfile(input: {
  defaultModel?: string;
  description?: string;
  icon?: unknown;
  instructions?: string;
  name?: string;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const now = new Date();
  await db.update(aiAgentProfile).set({
    ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    updatedAt: now,
    version: sql`${aiAgentProfile.version} + 1`,
  }).where(and(
    eq(aiAgentProfile.id, input.profileId),
    eq(aiAgentProfile.workspaceId, input.workspaceId),
    eq(aiAgentProfile.status, "active"),
  ));
  return getAgentProfileDetail(input);
}

export async function replaceAgentProfileAccess(input: {
  grants: Array<{
    principalId: string;
    principalType: "user" | "team";
    role: "editor" | "user";
  }>;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  await validateAccessPrincipals(input.workspaceId, input.grants);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(aiAgentProfileAccess).where(
      eq(aiAgentProfileAccess.profileId, input.profileId),
    );
    if (input.grants.length > 0) {
      await tx.insert(aiAgentProfileAccess).values(input.grants.map((grant) => ({
        createdAt: now,
        createdByUserId: input.userId,
        id: crypto.randomUUID(),
        principalId: grant.principalId,
        principalType: grant.principalType,
        profileId: input.profileId,
        role: grant.role,
        updatedAt: now,
      })));
    }
    await tx.update(aiAgentProfile).set({
      updatedAt: now,
      version: sql`${aiAgentProfile.version} + 1`,
    }).where(eq(aiAgentProfile.id, input.profileId));
  });
  return getAgentProfileDetail(input);
}

export async function transferAgentProfileOwnership(input: {
  newOwnerUserId: string;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "owner" });
  if (!(await isActiveMember(input.workspaceId, input.newOwnerUserId))) {
    throw new AgentProfileError("new_owner_not_member", "The new owner must be an active workspace member.", 409);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(aiAgentProfile).set({
      ownerUserId: input.newOwnerUserId,
      updatedAt: now,
      version: sql`${aiAgentProfile.version} + 1`,
    }).where(eq(aiAgentProfile.id, input.profileId));
    await tx.update(aiMcpConnection).set({
      lastErrorCode: "ownership_changed",
      state: "reconnect_required",
      updatedAt: now,
    }).where(eq(aiMcpConnection.agentProfileId, input.profileId));
  });
  return getAgentProfileDetail({ ...input, userId: input.newOwnerUserId });
}

export async function archiveAgentProfile(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "owner" });
  const now = new Date();
  const [activeThread] = await db.select({ id: aiChatThread.id }).from(aiChatThread)
    .where(and(
      eq(aiChatThread.agentProfileId, input.profileId),
      isNull(aiChatThread.deletedAt),
    )).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(aiAgentProfile).set({
      archivedAt: now,
      status: "archived",
      updatedAt: now,
      version: sql`${aiAgentProfile.version} + 1`,
    }).where(eq(aiAgentProfile.id, input.profileId));
    await tx.update(aiMcpConnection).set({
      disabledAt: now,
      state: "disabled",
      updatedAt: now,
    }).where(eq(aiMcpConnection.agentProfileId, input.profileId));
  });
  return { archived: true, hasExistingThreads: Boolean(activeThread) };
}

function serializeProfileSummary(
  profile: typeof aiAgentProfile.$inferSelect,
  role: AiAgentProfileRole,
): AiAgentProfileSummary {
  return {
    defaultModel: profile.defaultModel,
    description: profile.description,
    icon: profile.icon ?? null,
    id: profile.id,
    name: profile.name,
    ownerUserId: profile.ownerUserId,
    role,
    status: profile.status as "active" | "archived",
    updatedAt: profile.updatedAt.toISOString(),
    version: profile.version,
  };
}

function serializeConnection(
  connection: typeof aiMcpConnection.$inferSelect,
): McpConnectionSummary {
  return {
    agentProfileId: connection.agentProfileId,
    scope: {
      type: "agent",
      agentProfileId: connection.agentProfileId!,
    },
    alwaysAllowEnabled: connection.alwaysAllowEnabled,
    authenticatedByUserId: connection.authenticatedByUserId,
    authMethod: connection.authMethod as "oauth" | "headers",
    catalogId: connection.catalogId,
    endpointUrl: connection.endpointUrl,
    id: connection.id,
    lastDiscoveredAt: connection.lastDiscoveredAt?.toISOString() ?? null,
    lastErrorCode: connection.lastErrorCode,
    serverLabel: connection.serverLabel,
    state: connection.state as McpConnectionSummary["state"],
  };
}

async function validateAccessPrincipals(
  workspaceId: string,
  grants: Array<{ principalId: string; principalType: "user" | "team" }>,
) {
  for (const grant of grants) {
    const valid = grant.principalType === "user"
      ? await isActiveMember(workspaceId, grant.principalId)
      : Boolean((await db.select({ id: team.id }).from(team).where(and(
          eq(team.id, grant.principalId),
          eq(team.organizationId, workspaceId),
        )).limit(1))[0]);
    if (!valid) {
      throw new AgentProfileError(
        "invalid_access_principal",
        "Every shared user or team must belong to this workspace.",
        409,
      );
    }
  }
}

async function isActiveMember(workspaceId: string, userId: string) {
  return Boolean((await db.select({ id: member.id }).from(member).where(and(
    eq(member.organizationId, workspaceId),
    eq(member.userId, userId),
    activeMembershipCondition(),
  )).limit(1))[0]);
}
