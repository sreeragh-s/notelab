import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeAll, afterAll, test, expect, vi } from "vitest";
import * as schema from "../../infrastructure/database/schema";
import { runWithDb } from "../../infrastructure/database";
import { disconnectCalendarBinding, requireCalendarBinding } from "./connections/ownership";
const enabled = Boolean(process.env.CALENDAR_TEST_DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.CALENDAR_TEST_DATABASE_URL }) : null;
const database = pool ? drizzle(pool, { schema }) : null;
const userId = randomUUID(), otherUser = randomUUID(), workspaceId = randomUUID();
const accountId = randomUUID(), secondAccount = randomUUID(), bindingId = randomUUID();
beforeAll(async () => {
  if (!database) return;
  await database.insert(schema.user).values([userId, otherUser].map(id => ({ id, name: "Calendar fixture", email: `${id}@example.test`, emailVerified: true })));
  await database.insert(schema.workspace).values({ id: workspaceId, name: "Calendar", slug: workspaceId });
  await database.insert(schema.member).values([userId, otherUser].map(id => ({ id: randomUUID(), organizationId: workspaceId, userId: id, role: "owner" })));
  await database.insert(schema.calendarAccount).values([accountId, secondAccount].map(id => ({ id, userId, googleSubject: id, email: `${id}@example.test`, secret: { ciphertext: "fixture", iv: "fixture", keyVersion: "v1" }, scopes: [] })));
  await database.insert(schema.calendarBinding).values({ id: bindingId, userId, workspaceId, accountId });
});
afterAll(async () => { await pool?.end() });
test.skipIf(!enabled)("bindings enforce owner identity and allow multiple accounts", async () => {
  await expect(database!.insert(schema.calendarBinding).values({ id: randomUUID(), userId: otherUser, workspaceId, accountId })).rejects.toThrow();
  await database!.insert(schema.calendarBinding).values({ id: randomUUID(), userId, workspaceId, accountId: secondAccount });
  await expect(runWithDb(database!, () => requireCalendarBinding(otherUser, workspaceId, bindingId))).rejects.toThrow("unavailable");
  expect((await runWithDb(database!, () => requireCalendarBinding(userId, workspaceId, bindingId))).account.id).toBe(accountId);
});
test.skipIf(!enabled)("disconnect removes only its own binding and last account", async () => {
  await runWithDb(database!, () => disconnectCalendarBinding(userId, workspaceId, bindingId));
  const rows = await database!.select().from(schema.calendarAccount);
  expect(rows.some(row => row.id === accountId)).toBe(false);
  expect(rows.some(row => row.id === secondAccount)).toBe(true);
});

import { beginCalendarOAuth, completeCalendarOAuth, CALENDAR_SCOPES } from "./provider/oauth";
import * as identityVerifier from "../../shared/security/google-id-token";
test.skipIf(!enabled)("OAuth commits verified accounts, rejects replay and missing scopes", async () => {
  const env = { CALENDAR_ENABLED: "true", CALENDAR_ENABLED_WORKSPACE_IDS: workspaceId, CALENDAR_GOOGLE_CLIENT_ID: "fixture", CALENDAR_GOOGLE_CLIENT_SECRET: "fixture", CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), BETTER_AUTH_URL: "http://localhost:3000", CLIENT_URL: "http://localhost:1420" };
  const verified = vi.spyOn(identityVerifier, "verifyGoogleIdToken").mockResolvedValue({ subject: "oauth-fixture", email: "oauth@example.test" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "access", refresh_token: "refresh", id_token: "identity", scope: CALENDAR_SCOPES.join(" ") })));
  try {
    const url = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "web" })));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state")!;
    await runWithDb(database!, () => completeCalendarOAuth(env, state, "code"));
    await expect(runWithDb(database!, () => completeCalendarOAuth(env, state, "code"))).rejects.toThrow("expired_oauth_attempt");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "access", refresh_token: "refresh", id_token: "identity", scope: "openid email" })));
    const denied = new URL(await runWithDb(database!, () => beginCalendarOAuth(env, { userId, workspaceId, clientKind: "web" })));
    await expect(runWithDb(database!, () => completeCalendarOAuth(env, denied.searchParams.get("state")!, "code"))).rejects.toThrow("missing_calendar_scopes");
  } finally { verified.mockRestore(); vi.unstubAllGlobals() }
});
