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
export async function synchronizeCalendarCache(database: CalendarDatabase, start: string, end: string, fetcher: Transport, recover = true) {
  return runCalendarSyncOnce(database, JSON.stringify([start, end, recover]), async () => {
    const base = `${calendarApiBasePath(database.identity.workspaceId)}/connections/${encodeURIComponent(database.identity.bindingId)}`;
    let sync: Pick<CalendarSyncResponse, "calendars"> = { calendars: await database.calendars.toArray() };
    const recoverMetadata = async () => {
      const last = await database.state.get("last_recovery");
      if (last && Date.now() - last.revision < 15_000) { sync = { calendars: await database.calendars.toArray() }; return }
      sync = await fetcher<CalendarSyncResponse>(`${base}/sync`, { method: "POST", body: "{}" });
      if (!database.isOpen()) return;
    await database.transaction("rw", database.calendars, database.ranges, database.events, database.state, async () => {
      const current = new Set(sync.calendars.map(c => c.id));
      for (const old of await database.calendars.toArray()) if (!current.has(old.id)) { await database.ranges.where("calendarId").equals(old.id).delete(); await database.state.delete(old.id); await database.events.filter(row => row.event.calendarId === old.id).delete() }
      await database.calendars.clear(); await database.calendars.bulkPut(sync.calendars);
    });
      await database.state.put({ key: "last_recovery", revision: Date.now(), generation: 1 });
    };
    if (recover) {
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(`${database.name}:provider-recovery`, recoverMetadata);
      else await recoverMetadata();
    }
    if (!database.isOpen()) return;
    const pinned = [];
    for (const calendar of sync.calendars.filter(c => c.permissions.read && !c.permissions.freeBusyOnly)) {
      const load = async () => {
      const prior = await database.ranges.get(calendarRangeKey(calendar.id, start, end));
      const state = await database.state.get(calendar.id);
      if (prior && Date.now() - prior.fetchedAt < 2000 && (!state || (state.revision <= prior.revision && state.generation <= prior.generation))) return;
      let pageToken: string | null = null;
      do {
        const params: URLSearchParams = new URLSearchParams({ calendarId: calendar.id, start, end, ...(pageToken ? { pageToken } : {}) });
        const response: CalendarRangeResponse = await fetcher<CalendarRangeResponse>(`${base}/ranges?${params}`);
        if (!database.isOpen()) return;
        await applyCalendarRange(database, response); pageToken = response.nextPageToken;
      } while (pageToken);
      };
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(`${database.name}:range:${calendar.id}:${start}:${end}`, load);
      else await load();
      pinned.push(calendarRangeKey(calendar.id, start, end));
    }
    await evictCalendarRanges(database, pinned);
  });
}

export async function prefetchCalendarMonths(database: CalendarDatabase, start: string, end: string, fetcher: Transport) {
  const middle = new Date((Date.parse(start) + Date.parse(end)) / 2);
  for (const offset of [0, -1, 1]) {
    if (!database.isOpen()) return;
    const from = new Date(Date.UTC(middle.getUTCFullYear(), middle.getUTCMonth() + offset, 1)).toISOString();
    const until = new Date(Date.UTC(middle.getUTCFullYear(), middle.getUTCMonth() + offset + 1, 1)).toISOString();
    const calendars = await database.calendars.toArray();
    const ranges = await Promise.all(calendars.map(calendar => database.ranges.get(calendarRangeKey(calendar.id, from, until))));
    if (ranges.length && ranges.every(range => range && Date.now() - range.fetchedAt < 300_000)) continue;
    await synchronizeCalendarCache(database, from, until, fetcher, false);
  }
}
