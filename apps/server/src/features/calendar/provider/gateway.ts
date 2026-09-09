import { z } from "zod";
import type { CalendarEvent, CalendarEventTime, CalendarIdentity, CalendarRecord } from "@zilobase/features/calendar";
export class CalendarProviderError extends Error {
  constructor(public status: number, public code: string, public retryAfterMs = 0) { super(code) }
}
const time = z.object({ date: z.string().optional(), dateTime: z.string().optional(), timeZone: z.string().optional() });
export const googleEventSchema = z.object({
  id: z.string(), etag: z.string().optional(), summary: z.string().optional(), description: z.string().optional(), location: z.string().optional(),
  start: time.optional(), end: time.optional(), status: z.enum(["confirmed", "tentative", "cancelled"]).optional(), eventType: z.string().optional(),
  recurringEventId: z.string().optional(), originalStartTime: time.optional(), recurrence: z.array(z.string()).optional(),
  attendees: z.array(z.object({ email: z.string(), displayName: z.string().optional(), optional: z.boolean().optional(), self: z.boolean().optional(), organizer: z.boolean().optional(), responseStatus: z.enum(["needsAction", "declined", "tentative", "accepted"]).default("needsAction") }).passthrough()).optional(),
  organizer: z.object({ email: z.string(), self: z.boolean().optional() }).passthrough().optional(),
  reminders: z.object({ useDefault: z.boolean(), overrides: z.array(z.object({ method: z.enum(["email", "popup"]), minutes: z.number() })).optional() }).optional(),
  transparency: z.enum(["opaque", "transparent"]).optional(), visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
  conferenceData: z.object({ createRequest: z.object({ status: z.object({ statusCode: z.enum(["pending", "success", "failure"]).optional() }).optional() }).passthrough().optional() }).passthrough().optional(),
  colorId: z.string().optional(), htmlLink: z.string().optional(), hangoutLink: z.string().optional(),
}).passthrough();
export type GoogleCalendarEvent = z.infer<typeof googleEventSchema>;
export class CalendarGateway {
  constructor(private token: string, private fetcher: typeof fetch = fetch) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Calendar provider path");
    const response = await this.fetcher(`https://www.googleapis.com/calendar/v3${path}`, { ...options, signal: AbortSignal.timeout(20_000), headers: { "content-type": "application/json", ...options.headers, authorization: `Bearer ${this.token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { errors?: { reason?: string }[] } };
      throw new CalendarProviderError(response.status, body.error?.errors?.[0]?.reason ?? "provider_error", Number(response.headers.get("retry-after") ?? 0) * 1000);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  async calendars(bindingId: string): Promise<CalendarRecord[]> {
    const records: CalendarRecord[] = []; let pageToken: string | undefined;
    do {
      const response = await this.request<{ items?: { id: string; summary?: string; timeZone?: string; colorId?: string; primary?: boolean; accessRole?: string; defaultReminders?: CalendarRecord["defaultReminders"] }[]; nextPageToken?: string }>(`/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const item of response.items ?? []) records.push({ id: item.id, bindingId, name: item.summary ?? item.id, timeZone: item.timeZone ?? "UTC", colorId: item.colorId ?? null, primary: item.primary ?? false, defaultReminders: item.defaultReminders ?? [], permissions: { read: item.accessRole !== "none", write: ["writer", "owner"].includes(item.accessRole ?? ""), owner: item.accessRole === "owner", freeBusyOnly: item.accessRole === "freeBusyReader" } });
      pageToken = response.nextPageToken;
    } while (pageToken);
    return records;
  }
  events(calendarId: string, params: Record<string, string>) {
    return this.request<{ items?: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams(params)}`);
  }
}
export function normalizeEvent(raw: unknown, scope: Omit<CalendarIdentity, "eventId">, zone: string): CalendarEvent {
  const event = googleEventSchema.parse(raw);
  const normalizeTime = (value: z.infer<typeof time> | undefined): CalendarEventTime => {
    if (value?.date) return { date: value.date };
    if (value?.dateTime) return { dateTime: value.dateTime, timeZone: value.timeZone ?? zone };
    if (event.status === "cancelled") return { date: "1970-01-01" };
    throw new CalendarProviderError(502, "invalid_event_time");
  };
  return { ...scope, eventId: event.id, etag: event.etag ?? "", title: event.summary ?? "Untitled event", description: event.description ?? "", location: event.location ?? "", start: normalizeTime(event.start), end: normalizeTime(event.end), status: event.status ?? "confirmed", eventType: event.eventType ?? "default", recurringEventId: event.recurringEventId, originalStartTime: event.originalStartTime ? normalizeTime(event.originalStartTime) : undefined, recurrence: event.recurrence, attendees: event.attendees ?? [], organizer: event.organizer, reminders: event.reminders ?? { useDefault: true }, transparency: event.transparency ?? "opaque", visibility: event.visibility ?? "default", colorId: event.colorId ?? null, htmlLink: event.htmlLink ?? "", conferenceUrl: event.hangoutLink, conferenceStatus: conferenceStatus(event) };
}

function conferenceStatus(event: GoogleCalendarEvent) { return event.conferenceData?.createRequest?.status?.statusCode }
