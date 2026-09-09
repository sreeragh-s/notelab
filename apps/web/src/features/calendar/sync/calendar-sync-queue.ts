import type { CalendarDatabase } from "../storage/calendar-database";
const queues = new Map<string, Promise<unknown>>(), requests = new Map<string, Promise<unknown>>();
export function runCalendarSyncOnce<T>(database: CalendarDatabase, requestKey: string, run: () => Promise<T>): Promise<T> {
  const key = `${database.name}:${requestKey}`, existing = requests.get(key); if (existing) return existing as Promise<T>;
  const request = (queues.get(database.name) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(database.name, request); requests.set(key, request);
  void request.finally(() => { if (requests.get(key) === request) requests.delete(key); if (queues.get(database.name) === request) queues.delete(database.name) }).catch(() => {});
  return request;
}
