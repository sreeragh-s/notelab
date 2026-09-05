import { Hono } from "hono";
import { and, eq } from "drizzle-orm";

import type { AppBindings } from "../../../shared/types";
import { getStringEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { aiAgentProfile, aiAgentTrigger, automationSecret } from "../../../infrastructure/database/schema";
import { decryptAutomationSecret } from "../../databases/automations/secret-crypto";
import { acceptAgentEvent } from "./agent-trigger-service";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export const aiAgentWebhookRoutes = new Hono<AppBindings>();

aiAgentWebhookRoutes.post("/agents/:agentId/hooks/:triggerId", async (c) => {
  if (getStringEnv(c.env, "AI_CUSTOM_AGENTS_ENABLED") !== "true" ||
      getStringEnv(c.env, "AI_CUSTOM_AGENT_EXTERNAL_EVENTS_ENABLED") !== "true") {
    return c.json({ error: "Not found" }, 404);
  }
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return c.json({ error: "Payload too large" }, 413);
  }
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_WEBHOOK_BYTES) {
    return c.json({ error: "Payload too large" }, 413);
  }
  const timestamp = c.req.header("x-zilobase-timestamp")?.trim() ?? "";
  const delivery = c.req.header("x-zilobase-delivery")?.trim() ?? "";
  const signature = c.req.header("x-zilobase-signature")?.trim() ?? "";
  const timestampMs = Date.parse(timestamp);
  if (!delivery || delivery.length > 200 || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return c.json({ error: "Invalid webhook request" }, 401);
  }
  const [record] = await db.select({
    profile: aiAgentProfile,
    secret: automationSecret,
    trigger: aiAgentTrigger,
  }).from(aiAgentTrigger)
    .innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentTrigger.profileId))
    .innerJoin(automationSecret, eq(automationSecret.id, aiAgentTrigger.webhookSecretId))
    .where(and(
      eq(aiAgentProfile.id, c.req.param("agentId")),
      eq(aiAgentProfile.status, "active"),
      eq(aiAgentTrigger.id, c.req.param("triggerId")),
      eq(aiAgentTrigger.kind, "webhook"),
      eq(aiAgentTrigger.status, "active"),
    )).limit(1);
  if (!record?.secret.ownerUserId) return c.json({ error: "Not found" }, 404);
  const secret = await decryptAutomationSecret(c.env, record.secret, {
    ownerUserId: record.secret.ownerUserId,
    purpose: "agent_inbound_webhook",
    secretId: record.secret.id,
    workspaceId: record.profile.workspaceId,
  });
  if (!(await verifySignature(secret, `${timestamp}.${raw}`, signature))) {
    return c.json({ error: "Invalid webhook request" }, 401);
  }
  let payload: Record<string, unknown>;
  try {
    const value = JSON.parse(raw) as unknown;
    payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value };
  } catch {
    return c.json({ error: "Webhook body must be JSON" }, 400);
  }
  const result = await acceptAgentEvent({
    env: c.env,
    eventKey: `webhook:${record.trigger.id}:${delivery}`,
    payload,
    profileId: record.profile.id,
    triggerId: record.trigger.id,
    workspaceId: record.profile.workspaceId,
  });
  return c.json({ accepted: true, duplicate: result.duplicate, runId: result.run?.id ?? null }, 202);
});

async function verifySignature(secret: string, message: string, signature: string) {
  const supplied = signature.startsWith("sha256=") ? signature.slice(7) : "";
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(supplied.match(/../g) ?? [], (value) => Number.parseInt(value, 16)),
    new TextEncoder().encode(message),
  );
}
