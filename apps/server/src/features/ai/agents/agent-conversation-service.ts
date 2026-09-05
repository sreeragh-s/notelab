import type {
  CustomAgentChatIntent,
  CustomAgentDefinition,
} from "@zilobase/features/ai-chat/custom-agent-contract";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  aiAgentConversation,
  aiAgentConversationMessage,
  aiAgentProfile,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  definitionForProfile,
  normalizeAgentDefinition,
} from "./agent-definition";
import {
  AgentProfileError,
  requireAgentProfileRole,
} from "./agent-profile-service";
import {
  applyAgentDefinition,
  getCurrentAgentRevision,
} from "./agent-revision-service";
import { enqueueAgentRun } from "./agent-run-queue";

export async function listAgentConversation(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  const [conversation] = await db
    .select()
    .from(aiAgentConversation)
    .where(
      and(
        eq(aiAgentConversation.profileId, input.profileId),
        eq(aiAgentConversation.visibility, "shared"),
      ),
    )
    .limit(1);
  if (!conversation)
    throw new AgentProfileError(
      "agent_conversation_not_found",
      "Agent conversation not found.",
      404,
    );
  const messages = await db
    .select()
    .from(aiAgentConversationMessage)
    .where(eq(aiAgentConversationMessage.conversationId, conversation.id))
    .orderBy(asc(aiAgentConversationMessage.sequence));
  return messages.map((message) => ({
    agentId: input.profileId,
    authorUserId: message.authorUserId,
    createdAt: message.createdAt.toISOString(),
    id: message.id,
    kind: message.kind,
    parts: message.parts,
    revisionId: message.revisionId,
    role: message.role,
    runId: message.runId,
    sequence: message.sequence,
    status: message.status,
  }));
}

export async function listLegacyAgentConversations(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  const conversations = await db
    .select()
    .from(aiAgentConversation)
    .where(
      and(
        eq(aiAgentConversation.profileId, input.profileId),
        eq(aiAgentConversation.visibility, "legacy_private"),
        eq(aiAgentConversation.legacyOwnerUserId, input.userId),
      ),
    )
    .orderBy(asc(aiAgentConversation.createdAt));
  return Promise.all(
    conversations.map(async (conversation) => {
      const messages = await db
        .select()
        .from(aiAgentConversationMessage)
        .where(eq(aiAgentConversationMessage.conversationId, conversation.id))
        .orderBy(asc(aiAgentConversationMessage.sequence));
      return {
        id: conversation.id,
        lastActivityAt: conversation.lastActivityAt.toISOString(),
        legacyThreadId: conversation.legacyThreadId!,
        messages: messages.map((message) => ({
          agentId: input.profileId,
          authorUserId: message.authorUserId,
          createdAt: message.createdAt.toISOString(),
          id: message.id,
          kind: message.kind,
          parts: message.parts,
          revisionId: message.revisionId,
          role: message.role,
          runId: message.runId,
          sequence: message.sequence,
          status: message.status,
        })),
      };
    }),
  );
}

export async function submitAgentConversationMessage(input: {
  clientId?: string | null;
  env?: RuntimeEnv;
  message: string;
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  const { profile, text, intent } = await prepareAgentMessage(input);
  if (input.clientId) {
    const [existing] = await db
      .select({ message: aiAgentConversationMessage })
      .from(aiAgentConversationMessage)
      .innerJoin(
        aiAgentConversation,
        eq(aiAgentConversation.id, aiAgentConversationMessage.conversationId),
      )
      .where(
        and(
          eq(aiAgentConversation.profileId, input.profileId),
          eq(aiAgentConversation.visibility, "shared"),
          eq(aiAgentConversationMessage.clientId, input.clientId),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        intent,
        message: existing.message,
        replayed: true,
        revision: null,
        run: null,
      };
    }
  }
  const userMessage = await appendConversationMessage({
    authorUserId: input.userId,
    clientId: input.clientId,
    kind: "message",
    parts: [{ text, type: "text" }],
    profileId: input.profileId,
    role: "user",
  });

  if (intent === "clarify") {
    const assistant = await appendConversationMessage({
      kind: "message",
      parts: [
        {
          text: "Should I update this agent’s configuration, run its current instructions now, or do both?",
          type: "text",
        },
      ],
      profileId: input.profileId,
      role: "assistant",
    });
    return { intent, message: assistant, revision: null, run: null };
  }

  let revision: Awaited<ReturnType<typeof applyAgentDefinition>> | null = null;
  if (intent === "configure" || intent === "configure_and_run") {
    const currentRevision = await getCurrentAgentRevision(input.profileId);
    const currentDefinition = currentRevision
      ? normalizeAgentDefinition(currentRevision.definition)
      : definitionForProfile(profile);
    const definition = inferDefinitionChange(currentDefinition, text);
    revision = await applyAgentDefinition({
      definition,
      profileId: input.profileId,
      sourceMessageId: userMessage.id,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    await appendConversationMessage({
      kind: "revision",
      parts: [
        {
          text: `Applied revision ${revision.version}.`,
          type: "text",
        },
        { definition: revision.definition, type: "revision" },
      ],
      profileId: input.profileId,
      revisionId: revision.id,
      role: "assistant",
    });
  }

  let run: Awaited<ReturnType<typeof enqueueAgentRun>> | null = null;
  if (["run", "configure_and_run"].includes(intent)) {
    run = await enqueueAgentRun({
      env: input.env,
      initiatedByUserId: input.userId,
      input: { prompt: text },
      profileId: input.profileId,
      revisionId: revision?.id,
      triggerKind: "manual",
      workspaceId: input.workspaceId,
    });
    await appendConversationMessage({
      kind: "run",
      parts: [{ status: run.status, text: "Run queued", type: "run" }],
      profileId: input.profileId,
      role: "assistant",
      runId: run.id,
      status: "pending",
    });
  }
  return { intent, message: userMessage, revision, run };
}

export async function startManualAgentRun(input: {
  env?: RuntimeEnv;
  profileId: string;
  prompt?: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  const prompt =
    input.prompt?.trim() || "Run the saved agent instructions now.";
  if (input.prompt?.trim()) {
    await appendConversationMessage({
      authorUserId: input.userId,
      kind: "message",
      parts: [{ text: prompt, type: "text" }],
      profileId: input.profileId,
      role: "user",
    });
  }
  const run = await enqueueAgentRun({
    env: input.env,
    initiatedByUserId: input.userId,
    input: { prompt },
    profileId: input.profileId,
    triggerKind: "manual",
    workspaceId: input.workspaceId,
  });
  await appendConversationMessage({
    kind: "run",
    parts: [{ status: run.status, text: "Run queued", type: "run" }],
    profileId: input.profileId,
    role: "assistant",
    runId: run.id,
    status: "pending",
  });
  return run;
}

export function classifyAgentMessage(message: string): CustomAgentChatIntent {
  const value = message.trim().toLowerCase();
  const configure =
    /(?:\bconfigure\b|\bchange (?:the )?(?:agent|instructions|configuration|settings|model|name)\b|\bupdate (?:the )?(?:agent|instructions|configuration|settings|model|name)\b|\brename\b|\bset (?:the )?(?:name|instructions|model)\b|\binstructions?\s*:|\bfrom now on\b|\bevery (?:day|week|month|year)\b|\bschedule\b|\btrigger\b)/.test(
      value,
    );
  const run =
    /(?:\brun\b|\bexecute\b|\btest (?:it|the agent)\b|\bdo it now\b|\bnow run\b|\buse (?:the )?.+ connector\b|\bcheck\b|\bfind\b|\bidentify\b|\bsummari[sz]e\b|\bcreate\b|\bupdate\b[^.!?\n]{0,80}\b(?:page|database)\b)/.test(
      value,
    );
  if (configure && run) return "configure_and_run";
  if (configure) return "configure";
  if (run) return "run";
  return "clarify";
}

function inferDefinitionChange(
  current: CustomAgentDefinition,
  message: string,
): CustomAgentDefinition {
  const definition = { ...current };
  const name = message
    .match(
      /(?:rename (?:this )?agent to|set (?:the )?name to|name this agent)\s+[“"']?([^\n“”"']+)/i,
    )?.[1]
    ?.trim();
  if (name) definition.name = name.slice(0, 120);
  const explicitInstructions = message
    .match(/instructions?\s*:\s*([\s\S]+)/i)?.[1]
    ?.trim();
  if (explicitInstructions) {
    definition.instructions = explicitInstructions.slice(0, 20_000);
  } else {
    const configurationNote = message.trim();
    definition.instructions = [current.instructions.trim(), configurationNote]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000);
  }
  return definition;
}

async function appendConversationMessage(input: {
  authorUserId?: string | null;
  clientId?: string | null;
  kind: "message" | "revision" | "run" | "approval";
  parts: unknown[];
  profileId: string;
  revisionId?: string | null;
  role: "user" | "assistant" | "system";
  runId?: string | null;
  status?: "pending" | "completed" | "failed" | "cancelled";
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(aiAgentConversation)
      .where(
        and(
          eq(aiAgentConversation.profileId, input.profileId),
          eq(aiAgentConversation.visibility, "shared"),
        ),
      )
      .limit(1)
      .for("update");
    if (!conversation)
      throw new AgentProfileError(
        "agent_conversation_not_found",
        "Agent conversation not found.",
        404,
      );
    if (input.clientId) {
      const [existing] = await tx
        .select()
        .from(aiAgentConversationMessage)
        .where(
          and(
            eq(aiAgentConversationMessage.conversationId, conversation.id),
            eq(aiAgentConversationMessage.clientId, input.clientId),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    const sequence = conversation.nextMessageSequence + 1;
    const [message] = await tx
      .insert(aiAgentConversationMessage)
      .values({
        authorUserId: input.authorUserId ?? null,
        clientId: input.clientId ?? null,
        conversationId: conversation.id,
        createdAt: now,
        id: crypto.randomUUID(),
        kind: input.kind,
        parts: input.parts,
        revisionId: input.revisionId ?? null,
        role: input.role,
        runId: input.runId ?? null,
        sequence,
        status: input.status ?? "completed",
        updatedAt: now,
      })
      .returning();
    await tx
      .update(aiAgentConversation)
      .set({
        lastActivityAt: now,
        nextMessageSequence: sequence,
        updatedAt: now,
      })
      .where(eq(aiAgentConversation.id, conversation.id));
    return message!;
  });
}

async function prepareAgentMessage(
  input: Parameters<typeof submitAgentConversationMessage>[0],
) {
  const role = await requireAgentProfileRole({ ...input, minimum: "user" });
  const [profile] = await db
    .select()
    .from(aiAgentProfile)
    .where(
      and(
        eq(aiAgentProfile.id, input.profileId),
        eq(aiAgentProfile.workspaceId, input.workspaceId),
        eq(aiAgentProfile.status, "active"),
      ),
    )
    .limit(1);
  if (!profile)
    throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
  const text = input.message.trim();
  if (!text)
    throw new AgentProfileError("agent_message_empty", "Message is required.");
  const intent = classifyAgentMessage(text);
  if (
    (intent === "configure" || intent === "configure_and_run") &&
    role === "user"
  ) {
    throw new AgentProfileError(
      "agent_configuration_forbidden",
      "Only agent editors can change its configuration.",
      403,
    );
  }
  return { profile, text, intent };
}
