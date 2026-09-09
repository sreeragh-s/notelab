import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppBindings } from "../../../shared/types";
import { db } from "../../../infrastructure/database";
import { calendarProviderCalendar } from "../../../infrastructure/database/schema";
import { requireCalendarBinding } from "../connections/ownership";
import { createCalendarGateway } from "../provider/oauth";
import { CalendarProviderError, normalizeEvent } from "../provider/gateway";
import { refreshCalendarList, queueCalendarSync } from "./sync";
import { calendarRangeSchema, readCalendarRange } from "./ranges";
export const calendarSyncRoutes = new Hono<AppBindings>();
calendarSyncRoutes.post("/connections/:bindingId/sync", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const gateway = await createCalendarGateway(c.env, account), calendars = await refreshCalendarList(account.id, binding.id, gateway);
  for (const calendar of calendars.filter(c => !c.permissions.freeBusyOnly)) await queueCalendarSync(c.env, account.id, calendar.id);
  const states = await db.select().from(calendarProviderCalendar).where(eq(calendarProviderCalendar.accountId, account.id));
  return c.json({ calendars, revisions: Object.fromEntries(states.map(s => [s.calendarId, s.revision])), pending: true });
});
calendarSyncRoutes.get("/connections/:bindingId/ranges", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const range = calendarRangeSchema.parse(c.req.query());
  const [state] = await db.select().from(calendarProviderCalendar).where(and(eq(calendarProviderCalendar.accountId, account.id), eq(calendarProviderCalendar.calendarId, range.calendarId)));
  if (!state || state.data.permissions.freeBusyOnly) throw new CalendarProviderError(403, "calendar_unavailable");
  return c.json(await readCalendarRange({ ...range, accountId: account.id, bindingId: binding.id, workspaceId: binding.workspaceId, timeZone: state.data.timeZone, generation: state.generation, revision: state.revision }, await createCalendarGateway(c.env, account)));
});
calendarSyncRoutes.get("/connections/:bindingId/search", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const range = calendarRangeSchema.parse(c.req.query()), query = c.req.query("q")?.trim() ?? "";
  if (!query || query.length > 500) throw new CalendarProviderError(400, "invalid_search");
  const gateway = await createCalendarGateway(c.env, account);
  const response = await gateway.events(range.calendarId, { q: query, timeMin: range.start, timeMax: range.end, singleEvents: "true", maxResults: "100", ...(range.pageToken ? { pageToken: range.pageToken } : {}) });
  return c.json({ events: (response.items ?? []).map(raw => normalizeEvent(raw, { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId: range.calendarId }, "UTC")), nextPageToken: response.nextPageToken ?? null });
});
calendarSyncRoutes.get("/connections/:bindingId/calendars/:calendarId/events/:eventId", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const gateway = await createCalendarGateway(c.env, account), calendarId = c.req.param("calendarId");
  const raw = await gateway.request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(c.req.param("eventId"))}`);
  return c.json({ event: normalizeEvent(raw, { workspaceId: binding.workspaceId, bindingId: binding.id, calendarId }, "UTC") });
});

// Metadata-only cache reads must never trigger another provider sync.
calendarSyncRoutes.get("/connections/:bindingId/catalog", async c => {
  const { account, binding } = await requireCalendarBinding(c.get("user")!.id, c.req.param("workspaceId")!, c.req.param("bindingId"));
  const states = await db.select().from(calendarProviderCalendar).where(eq(calendarProviderCalendar.accountId, account.id));
  return c.json({ calendars: states.map(state => ({ ...state.data, bindingId: binding.id })) });
});
