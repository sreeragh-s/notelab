import { emitCalendarMetric } from "../metrics";
import Dexie, { type EntityTable } from "dexie";
import { calendarEventKey, eventOverlaps, type CalendarEvent, type CalendarRecord, type CalendarRangeResponse } from "@zilobase/features/calendar";
export type CalendarCacheIdentity = { apiOrigin: string; userId: string; workspaceId: string; bindingId: string };
export type CachedRange = { key: string; calendarId: string; start: string; end: string; eventKeys: string[]; generation: number; revision: number; fetchedAt: number; accessedAt: number };
export type PendingCalendarMutation = { id: string; eventKey: string; before?: CalendarEvent; optimistic?: CalendarEvent; status: "pending" | "ambiguous" };
export class CalendarDatabase extends Dexie {
  calendars!: EntityTable<CalendarRecord, "id">;
  events!: EntityTable<{ key: string; event: CalendarEvent }, "key">;
  ranges!: EntityTable<CachedRange, "key">;
  pending!: EntityTable<PendingCalendarMutation, "id">;
  state!: EntityTable<{ key: string; generation: number; revision: number }, "key">;
  reminders!: EntityTable<{ key: string; expiresAt: number }, "key">;
  constructor(readonly identity: CalendarCacheIdentity) {
    super(calendarDatabaseName(identity));
    this.version(1).stores({ calendars: "id", events: "key", ranges: "key, calendarId, accessedAt", pending: "id, eventKey", state: "key", reminders: "key, expiresAt" });
    this.on("versionchange", () => this.close());
  }
}
const openDatabases = new Map<string, CalendarDatabase>();
let lifecycle: BroadcastChannel | undefined;
export function calendarDatabaseName(identity: CalendarCacheIdentity) {
  const encode = (value: string) => { if (!value.trim()) throw new Error("Calendar cache identity required"); return encodeURIComponent(value) };
  return `zilobase:v2:${encode(new URL(identity.apiOrigin).origin)}:${encode(identity.userId)}:workspace:${encode(identity.workspaceId)}:calendar:${encode(identity.bindingId)}`;
}
export async function openCalendarDatabase(identity: CalendarCacheIdentity) {
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" && !lifecycle) {
    lifecycle = new BroadcastChannel("zilobase:calendar:lifecycle");
    lifecycle.onmessage = event => { if (typeof event.data?.prefix === "string") closeMatching(event.data.prefix) };
  }
  const name = calendarDatabaseName(identity);
  let database = openDatabases.get(name);
  if (!database) { database = new CalendarDatabase(identity); openDatabases.set(name, database) }
  await database.open(); return database;
}
function closeMatching(prefix: string) {
  for (const [name, database] of openDatabases) if (name.startsWith(prefix)) { database.close(); openDatabases.delete(name) }
}
export async function prepareCalendarDatabasesForDeletion(prefix: string) { closeMatching(prefix); lifecycle?.postMessage({ prefix }) }
export async function destroyCalendarDatabase(name: string) { await prepareCalendarDatabasesForDeletion(name); await Dexie.delete(name) }
export function calendarRangeKey(calendarId: string, start: string, end: string) { return JSON.stringify([calendarId, start, end]) }
export async function applyCalendarRange(database: CalendarDatabase, response: CalendarRangeResponse) {
  if (!response.complete || response.nextPageToken) return false;
  return database.transaction("rw", database.events, database.ranges, database.state, database.pending, async () => {
    const state = await database.state.get(response.calendarId);
    if (newerRevision(state, response)) return false;
    const key = calendarRangeKey(response.calendarId, response.start, response.end), prior = await database.ranges.get(key);
    if (newerRevision(prior, response)) return false;
    const pendingRows = await database.pending.toArray();
    const pending = new Set(pendingRows.map(row => row.eventKey));
    const events = response.events.filter(event => event.status !== "cancelled");
    for (const event of events) {
      if (!matchesIdentity(event, database.identity, response.calendarId)) throw new Error("Calendar response identity mismatch");
      const eventKey = calendarEventKey(event); if (!pending.has(eventKey)) await database.events.put({ key: eventKey, event });
    }
    // An authoritative absence must also leave older overlapping memberships.
    const incoming = new Set(events.map(calendarEventKey));
    const older = await database.ranges.where("calendarId").equals(response.calendarId).toArray();
    for (const range of older) {
      if (newerRevision(range, response)) continue;
      const rows = await database.events.bulkGet(range.eventKeys);
      const eventKeys = range.eventKeys.filter((eventKey, index) => {
        const event = rows[index]?.event;
        return pending.has(eventKey) || incoming.has(eventKey) || !event || !eventOverlaps(event, response.start, response.end, event.start.timeZone ?? "UTC");
      });
      if (eventKeys.length !== range.eventKeys.length) await database.ranges.update(range.key, { eventKeys });
    }
    await database.ranges.put({ key, calendarId: response.calendarId, start: response.start, end: response.end, eventKeys: [...new Set([...events.map(calendarEventKey).filter(key => !pending.has(key)), ...pendingRows.filter(row => row.optimistic?.calendarId === response.calendarId && eventOverlaps(row.optimistic, response.start, response.end, row.optimistic.start.timeZone ?? "UTC")).map(row => row.eventKey)])], generation: response.generation, revision: response.revision, fetchedAt: Date.now(), accessedAt: Date.now() });
    await database.state.put({ key: response.calendarId, generation: response.generation, revision: response.revision });
    return true;
  });
}
export async function readCalendarRangeCache(database: CalendarDatabase, calendarId: string, start: string, end: string) {
  const candidates = (await database.ranges.where("calendarId").equals(calendarId).toArray()).filter(row => Date.parse(row.start) < Date.parse(end) && Date.parse(row.end) > Date.parse(start)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(b.end) - Date.parse(a.end));
  let coveredUntil = Date.parse(start);
  const selected: CachedRange[] = [];
  for (const range of candidates) {
    if (Date.parse(range.end) <= coveredUntil) continue;
    if (Date.parse(range.start) > coveredUntil) break;
    selected.push(range); coveredUntil = Date.parse(range.end); if (coveredUntil >= Date.parse(end)) break;
  }
  emitCalendarMetric("cache_hit", coveredUntil >= Date.parse(end) ? 1 : 0);
  // Read all overlapping snapshots even when a hole separates cached windows.
  const ranges = candidates;
  const state = await database.state.get(calendarId), calendar = await database.calendars.get(calendarId);
  const rows = await database.events.bulkGet([...new Set(ranges.flatMap(range => range.eventKeys))]);
  return { events: rows.flatMap(row => row && eventOverlaps(row.event, start, end, calendar?.timeZone ?? "UTC") ? [row.event] : []), loaded: coveredUntil >= Date.parse(end), stale: coveredUntil < Date.parse(end) || !state || ranges.some(range => state.generation !== range.generation || state.revision > range.revision || Date.now() - range.fetchedAt > 300_000) };
}
export async function evictCalendarRanges(database: CalendarDatabase, pinnedKeys: string[]) {
  await database.transaction("rw", database.ranges, database.events, database.pending, async () => {
    const rows = await database.ranges.orderBy("accessedAt").reverse().toArray(), pinned = new Set(pinnedKeys);
    const pendingKeys = new Set((await database.pending.toArray()).map(row => row.eventKey));
    for (const row of rows) if (row.eventKeys.some(key => pendingKeys.has(key))) pinned.add(row.key);
    const buckets = new Set<string>();
    for (const row of rows) {
      const bucket = row.start.slice(0, 7);
      if (pinned.has(row.key) || buckets.has(bucket) || buckets.size < 12) { buckets.add(bucket); continue }
      await database.ranges.delete(row.key);
    }
    const retained = new Set((await database.ranges.toArray()).flatMap(row => row.eventKeys));
    for (const row of await database.pending.toArray()) retained.add(row.eventKey);
    const orphaned = (await database.events.toCollection().primaryKeys()).filter(key => !retained.has(String(key)));
    await database.events.bulkDelete(orphaned);
  });
}

function newerRevision(prior: { generation: number; revision: number } | undefined, incoming: { generation: number; revision: number }) { return Boolean(prior && (prior.generation > incoming.generation || (prior.generation === incoming.generation && prior.revision > incoming.revision))) }
function matchesIdentity(event: CalendarEvent, identity: CalendarCacheIdentity, calendarId: string) { return event.workspaceId === identity.workspaceId && event.bindingId === identity.bindingId && event.calendarId === calendarId }
