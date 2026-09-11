import { z } from "zod";
import type { CalendarScope, CalendarRecord } from "@zilobase/features/calendar";
import { CalendarProviderError, normalizeEvent, type CalendarGateway } from "../provider/gateway";
export const calendarSearchSchema = z.object({
  calendarId: z.string().min(1).max(1024), q: z.string().trim().min(1).max(500),
  start: z.iso.datetime({ offset: true }).optional(), end: z.iso.datetime({ offset: true }).optional(), pageToken: z.string().max(4096).optional(),
}).refine(value => !value.start || !value.end || Date.parse(value.end) > Date.parse(value.start), "End must follow start");
export async function searchCalendarEvents(input: z.infer<typeof calendarSearchSchema>, scope: CalendarScope, calendar: CalendarRecord | undefined, gateway: Pick<CalendarGateway, "events">) {
  if (!calendar?.permissions.read || calendar.permissions.freeBusyOnly) throw new CalendarProviderError(403, "calendar_unavailable");
  const response = await gateway.events(input.calendarId, { q: input.q, singleEvents: "true", maxResults: "100", orderBy: "startTime", ...(input.start ? { timeMin: input.start } : {}), ...(input.end ? { timeMax: input.end } : {}), ...(input.pageToken ? { pageToken: input.pageToken } : {}) });
  return { events: (response.items ?? []).map(raw => normalizeEvent(raw, { ...scope, calendarId: input.calendarId }, calendar.timeZone)), nextPageToken: response.nextPageToken ?? null };
}
