import { missingCalendarRanges } from "./range-coverage";
import { runCalendarSyncOnce } from "./calendar-sync-queue";
import { calendarApiBasePath, type CalendarRangeResponse, type CalendarSyncResponse } from "@zilobase/features/calendar";
import { applyCalendarRange, calendarRangeKey, evictCalendarRanges, type CalendarDatabase } from "../storage/calendar-database";
type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
export async function synchronizeCalendarCache(database: CalendarDatabase, start: string, end: string, fetcher: Transport, recover = true, options: { missingOnly?: boolean; priority?: number; metadataLoaded?: boolean; hiddenKeys?: string[]; requestId?: string; isCurrent?: () => boolean } = {}) {
  return runCalendarSyncOnce(database, JSON.stringify([start, end, recover, options.missingOnly, options.metadataLoaded, options.hiddenKeys, options.requestId]), async () => {
    if (options.isCurrent && !options.isCurrent()) return;
    const base = `${calendarApiBasePath(database.identity.workspaceId)}/connections/${encodeURIComponent(database.identity.bindingId)}`;
    let sync: Pick<CalendarSyncResponse, "calendars"> = { calendars: await database.calendars.toArray() };
    const storeMetadata = async () => {
      await database.transaction("rw", database.calendars, database.ranges, database.events, database.state, async () => {
        const current = new Set(sync.calendars.map(calendar => calendar.id));
        for (const old of await database.calendars.toArray()) if (!current.has(old.id)) { await database.ranges.where("calendarId").equals(old.id).delete(); await database.state.delete(old.id); await database.events.filter(row => row.event.calendarId === old.id).delete(); }
        await database.calendars.clear(); await database.calendars.bulkPut(sync.calendars);
      });
    };
    const recoverMetadata = async () => {
      const last = await database.state.get("last_recovery");
      if (last && Date.now() - last.revision < 15_000) { sync = { calendars: await database.calendars.toArray() }; return }
      sync = await fetcher<CalendarSyncResponse>(`${base}/sync`, { method: "POST", body: "{}" });
      if (!database.isOpen()) return;
      await storeMetadata();
      await database.state.put({ key: "last_recovery", revision: Date.now(), generation: 1 });
    };
    if (recover) {
      if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request(`${database.name}:provider-recovery`, recoverMetadata);
      else await recoverMetadata();
    } else if (!options.metadataLoaded) {
      sync = await fetcher<Pick<CalendarSyncResponse, "calendars">>(`${base}/catalog`);
      if (!database.isOpen()) return;
      await storeMetadata();
    }
    if (!database.isOpen()) return;
    const pinned = [];
    for (const calendar of sync.calendars.filter(c => c.permissions.read && !c.permissions.freeBusyOnly && !options.hiddenKeys?.includes(JSON.stringify([database.identity.bindingId, c.id])))) {
      const cached = await database.ranges.where("calendarId").equals(calendar.id).toArray();
      const requested = options.missingOnly ? missingCalendarRanges(start, end, cached) : [{ start, end }];
      pinned.push(...cached.filter(r => Date.parse(r.start) < Date.parse(end) && Date.parse(r.end) > Date.parse(start)).map(r => r.key));
      for (const range of requested.flatMap(r => calendarRequestRanges(r.start, r.end))) {
      if (options.isCurrent && !options.isCurrent()) return;
      const { start, end } = range;
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
    }
    await evictCalendarRanges(database, pinned);
  }, options.priority);
}

// Keep moving month windows within the server's 62-day per-request limit.
export function calendarRequestRanges(start: string, end: string) {
  const ranges: { start: string; end: string }[] = [];
  let cursor = Date.parse(start);
  const until = Date.parse(end);
  while (cursor < until) {
    const next = Math.min(until, cursor + 60 * 86400_000);
    ranges.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString() });
    cursor = next;
  }
  return ranges;
}
