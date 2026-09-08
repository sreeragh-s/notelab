import { calendarEventRoutes } from "./events/routes";
import { calendarSyncRoutes } from "./sync/routes";
import { calendarPreferenceRoutes } from "./preferences";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { calendarAccount, calendarBinding, calendarOauthAttempt } from "../../infrastructure/database/schema";
import { isCalendarFeatureEnabled, getCanonicalWebOrigin, getStringEnv } from "../../shared/config/config";
import type { AppBindings } from "../../shared/types";
import { requireCalendarMembership, CalendarAccessError, requireCalendarBinding, disconnectCalendarBinding } from "./connections/ownership";
import { beginCalendarOAuth, completeCalendarOAuth, createCalendarGateway } from "./provider/oauth";
import { CalendarProviderError } from "./provider/gateway";
import { getZilobaseDiscoveryDocument } from "../instance/service";
import { sha256Hex } from "../../shared/crypto/sha256";
export const calendarRoutes = new Hono<AppBindings>();
export const calendarProviderRoutes = new Hono<AppBindings>();
for (const app of [calendarRoutes, calendarProviderRoutes]) {
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store, max-age=0"); c.header("Referrer-Policy", "no-referrer"); c.header("X-Content-Type-Options", "nosniff");
    if (!isCalendarFeatureEnabled(c.env, c.req.param("workspaceId"))) return c.json({ message: "Not found." }, 404);
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof z.ZodError) return c.json({ message: "Invalid calendar request." }, 400);
    if (error instanceof CalendarAccessError) return c.json({ message: error.message }, error.status);
    if (error instanceof CalendarProviderError) return c.json({ message: error.code, code: error.code, retryAfterMs: error.retryAfterMs }, error.status === 401 ? 401 : error.status === 403 ? 403 : error.status === 404 ? 404 : error.status === 409 ? 409 : error.status === 412 ? 412 : error.status === 429 ? 429 : error.status === 400 ? 400 : 502);
    return c.json({ message: "Calendar request failed." }, 500);
  });
}
calendarRoutes.use("*", async (c, next) => {
  const user = c.get("user"); if (!user) return c.json({ message: "Authentication required." }, 401);
  await requireCalendarMembership(user.id, c.req.param("workspaceId")!); await next();
});
calendarRoutes.get("/connections", async c => {
  const rows = await db.select({ binding: calendarBinding, account: calendarAccount }).from(calendarBinding).innerJoin(calendarAccount, eq(calendarAccount.id, calendarBinding.accountId)).where(and(eq(calendarBinding.userId, c.get("user")!.id), eq(calendarBinding.workspaceId, c.req.param("workspaceId")!)));
  return c.json({ connections: rows.map(({ binding, account }) => ({ bindingId: binding.id, workspaceId: binding.workspaceId, accountId: account.id, email: account.email, status: account.status, pushAvailable: false })), providerConfigured: Boolean(getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_ID") && getStringEnv(c.env, "CALENDAR_GOOGLE_CLIENT_SECRET") && getStringEnv(c.env, "CALENDAR_TOKEN_ENCRYPTION_KEY")) });
});
calendarRoutes.post("/connections/google/start", async c => {
  const body = z.object({ client: z.enum(["web", "desktop"]) }).parse(await c.req.json());
  return c.json({ authorizationUrl: await beginCalendarOAuth(c.env, { userId: c.get("user")!.id, workspaceId: c.req.param("workspaceId")!, clientKind: body.client }) });
});
calendarRoutes.delete("/connections/:bindingId", async c => {
  await disconnectCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId")); return c.json({ disconnected: true });
});
calendarRoutes.get("/connections/:bindingId/calendars", async c => {
  const row = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  return c.json({ calendars: await (await createCalendarGateway(c.env, row.account)).calendars(row.binding.id) });
});
calendarProviderRoutes.get("/oauth/google/callback", async c => {
  const state = c.req.query("state"); if (!state) return c.json({ message: "Missing OAuth state." }, 400);
  if (c.req.query("error")) {
    const hash = await sha256Hex(state);
    await runWithDbEnv(c.env, () => db.update(calendarOauthAttempt).set({ consumedAt: new Date() }).where(eq(calendarOauthAttempt.stateHash, hash)));
    return c.text("Calendar connection cancelled. Return to Zilobase.");
  }
  const code = c.req.query("code"); if (!code) return c.json({ message: "Missing OAuth code." }, 400);
  const result = await runWithDbEnv(c.env, () => completeCalendarOAuth(c.env, state, code));
  if (result.clientKind === "desktop") {
    const discovery = await getZilobaseDiscoveryDocument(c.env); const url = new URL("zilobase://open");
    url.search = new URLSearchParams({ instance: discovery.instanceId, server: discovery.apiOrigin, path: "/calendar?connection=success" }).toString();
    const safe = url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    c.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    return c.html(`<!doctype html><title>Calendar connected</title><p>Calendar connected.</p><a href="${safe}">Open Zilobase Desktop</a>`);
  }
  return c.redirect(new URL("/calendar?connection=success", getCanonicalWebOrigin(c.env)).toString());
});

calendarRoutes.route("/", calendarPreferenceRoutes);

calendarRoutes.route("/", calendarSyncRoutes);

calendarRoutes.route("/", calendarEventRoutes);
