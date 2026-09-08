import { calendarApiBasePath, type CalendarRangeResponse, type CalendarSyncResponse } from "@zilobase/features/calendar";
import { applyCalendarRange, calendarRangeKey, evictCalendarRanges, type CalendarDatabase } from "../storage/calendar-database";
type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
const queues = new Map<string, Promise<unknown>>(), requests = new Map<string, Promise<unknown>>();
export function runCalendarSyncOnce<T>(database: CalendarDatabase, requestKey: string, run: () => Promise<T>): Promise<T> {
  const key = `${database.name}:${requestKey}`, existing = requests.get(key); if (existing) return existing as Promise<T>;
  const request = (queues.get(database.name) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(database.name, request); requests.set(key, request);
  void request.finally(() => { if (requests.get(key) === request) requests.delete(key); if (queues.get(database.name) === request) queues.delete(database.name) }).catch(() => {});
  return request;
}
export async function synchronizeCalendarCache(database: CalendarDatabase, start: string, end: string, fetcher: Transport) {
  return runCalendarSyncOnce(database, JSON.stringify([start, end]), async () => {
    const base = `${calendarApiBasePath(database.identity.workspaceId)}/connections/${encodeURIComponent(database.identity.bindingId)}`;
    const sync = await fetcher<CalendarSyncResponse>(`${base}/sync`, { method: "POST", body: "{}" });
    if (!database.isOpen()) return;
    await database.transaction("rw", database.calendars, database.ranges, database.events, database.state, async () => {
      const current = new Set(sync.calendars.map(c => c.id));
      for (const old of await database.calendars.toArray()) if (!current.has(old.id)) { await database.ranges.where("calendarId").equals(old.id).delete(); await database.state.delete(old.id) }
      await database.calendars.clear(); await database.calendars.bulkPut(sync.calendars);
    });
    const pinned = [];
    for (const calendar of sync.calendars.filter(c => c.permissions.read && !c.permissions.freeBusyOnly)) {
      let pageToken: string | null = null;
      do {
        const params: URLSearchParams = new URLSearchParams({ calendarId: calendar.id, start, end, ...(pageToken ? { pageToken } : {}) });
        const response: CalendarRangeResponse = await fetcher<CalendarRangeResponse>(`${base}/ranges?${params}`);
        if (!database.isOpen()) return;
        await applyCalendarRange(database, response); pageToken = response.nextPageToken;
      } while (pageToken);
      pinned.push(calendarRangeKey(calendar.id, start, end));
    }
    await evictCalendarRanges(database, pinned);
  });
}
