import { recordCalendarMetric } from "../metrics";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../infrastructure/database";
import { calendarRangeSnapshot } from "../../../infrastructure/database/schema";
import type { CalendarRangeResponse } from "@zilobase/features/calendar";
import { CalendarGateway, CalendarProviderError, normalizeEvent } from "../provider/gateway";
export const calendarRangeSchema = z.object({ calendarId: z.string().min(1).max(1024), start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }), pageToken: z.string().max(4096).optional() }).refine(r => Date.parse(r.end) > Date.parse(r.start) && Date.parse(r.end) - Date.parse(r.start) <= 62 * 86400_000, "Range must be positive and at most 62 days");
type RangeInput = z.infer<typeof calendarRangeSchema> & { accountId: string; bindingId: string; workspaceId: string; timeZone: string; generation: number; revision: number };
type Snapshot = typeof calendarRangeSnapshot.$inferSelect;
async function loadSnapshot(input: RangeInput) {
  if (!input.pageToken) return null;
  const [prior] = await db.select().from(calendarRangeSnapshot).where(and(eq(calendarRangeSnapshot.id, input.pageToken), eq(calendarRangeSnapshot.accountId, input.accountId), eq(calendarRangeSnapshot.calendarId, input.calendarId)));
  if (!prior || prior.start !== input.start || prior.end !== input.end || prior.expiresAt.getTime() < Date.now()) throw new CalendarProviderError(400, "expired_range_cursor");
  return prior;
}
async function storeSnapshot(row: Snapshot, prior: Snapshot | null) {
  if (!prior) { await db.insert(calendarRangeSnapshot).values(row); return }
  const [saved] = await db.update(calendarRangeSnapshot).set(row).where(and(eq(calendarRangeSnapshot.id, prior.id), eq(calendarRangeSnapshot.pageToken, prior.pageToken!))).returning();
  if (!saved) throw new CalendarProviderError(409, "range_cursor_advanced");
}
export async function readCalendarRange(input: RangeInput, gateway: CalendarGateway): Promise<CalendarRangeResponse> {
  const prior = await loadSnapshot(input);
  if (prior && !prior.pageToken) return result(prior, input);
  const began = performance.now();
  const response = await gateway.events(input.calendarId, { timeMin: input.start, timeMax: input.end, singleEvents: "true", maxResults: "500", ...(prior?.pageToken ? { pageToken: prior.pageToken } : {}) });
  recordCalendarMetric("range_latency", performance.now() - began);
  const incoming = (response.items ?? []).map(raw => normalizeEvent(raw, { workspaceId: input.workspaceId, bindingId: input.bindingId, calendarId: input.calendarId }, input.timeZone));
  const base = prior ?? { id: crypto.randomUUID(), accountId: input.accountId, calendarId: input.calendarId, start: input.start, end: input.end, generation: input.generation, revision: input.revision, events: [] };
  const events = [...new Map([...base.events, ...incoming].map(event => [event.eventId, event])).values()];
  const row = { ...base, events, pageToken: response.nextPageToken ?? null, expiresAt: new Date(Date.now() + 600_000) };
  await storeSnapshot(row, prior);
  return result(row, input);
}
function result(row: Snapshot, input: { bindingId: string; workspaceId: string }): CalendarRangeResponse {
  return { calendarId: row.calendarId, start: row.start, end: row.end, generation: row.generation, revision: row.revision, events: row.pageToken ? [] : row.events.map(event => ({ ...event, bindingId: input.bindingId, workspaceId: input.workspaceId })), complete: !row.pageToken, nextPageToken: row.pageToken ? row.id : null };
}
