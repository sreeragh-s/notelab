import { emitCalendarMetric } from "../metrics";
import { coversCalendarRange, type CalendarWindow } from "./range-coverage";
import { useQueryClient } from "@tanstack/react-query";
import { calendarEventKey, calendarKeys } from "@zilobase/features/calendar";
import { startCalendarRecovery } from "../realtime/calendar-recovery";
import { reconcileCalendarMutations } from "../events/calendar-mutations";
import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CalendarConnection } from "@zilobase/features/calendar";
import { apiFetch, toApiUrl } from "@/platform/network/api";
import { getConnectivityState, subscribeConnectivity } from "@/features/offline/model";
import { openCalendarDatabase, readCalendarRangeCache, type CalendarDatabase } from "../storage/calendar-database";
import { synchronizeCalendarCache } from "./calendar-cache-sync";
export function useCalendarCache(connection: CalendarConnection, userId: string, start: string, end: string, options?: { target?: CalendarWindow | null; hiddenKeys: string[] }) {
  const targetStart = options?.target?.start, targetEnd = options?.target?.end;
  const hiddenKey = JSON.stringify(options?.hiddenKeys ?? []);
  const requestKey = JSON.stringify([userId, connection.workspaceId, connection.bindingId, start, end, targetStart, targetEnd, hiddenKey]);
  const [readLatencyMs, setReadLatency] = useState(1000);
  const separateTarget = Boolean(targetStart && targetEnd && (Date.parse(targetStart) < Date.parse(start) || Date.parse(targetEnd) > Date.parse(end)));
  // Moving inside this window must not reread every buffered event.
  const materializationKey = JSON.stringify([userId, connection.workspaceId, connection.bindingId, start, end, hiddenKey, separateTarget ? targetStart : null, separateTarget ? targetEnd : null]);
  const client = useQueryClient();
  const [database, setDatabase] = useState<CalendarDatabase | null>(null), [error, setError] = useState<unknown>(), [syncing, setSyncing] = useState(false);
  const online = useSyncExternalStore(subscribeConnectivity, () => getConnectivityState() === "online", () => true);
  useEffect(() => {
    let active = true; setDatabase(null);
    void openCalendarDatabase({ apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin, userId, workspaceId: connection.workspaceId, bindingId: connection.bindingId }).then(db => { if (active) setDatabase(db) }).catch(setError);
    return () => { active = false };
  }, [connection.bindingId, connection.workspaceId, userId]);
  const activeRequest = useRef(0);
  const readController = useRef<AbortController | null>(null);
  useEffect(() => { activeRequest.current++; return () => { activeRequest.current++; readController.current?.abort(); } }, [database, online]);
  const refresh = useCallback(async (recover = true, missingOnly = false) => {
    if (!database || !online) return null;
    const generation = ++activeRequest.current;
    const prior = readController.current;
    const controller = new AbortController(); readController.current = controller;
    // Give the replacement consumer an opportunity to join overlapping work.
    setTimeout(() => prior?.abort(), 100);
    setSyncing(true);
    try {
      const hiddenKeys: string[] = JSON.parse(hiddenKey);
      const metadataLoaded = missingOnly && Boolean(await database.state.get("last_recovery"));
      const began = performance.now();
      if (targetStart && targetEnd) await synchronizeCalendarCache(database, targetStart, targetEnd, apiFetch, recover, { missingOnly, metadataLoaded, accountId: connection.accountId, hiddenKeys, priority: 10, signal: controller.signal, requestId: `${requestKey}:${generation}:target`, isCurrent: () => generation === activeRequest.current });
      if (generation !== activeRequest.current) return null;
      if (targetStart) { const elapsed = performance.now() - began; setReadLatency(old => old * 0.75 + elapsed * 0.25); emitCalendarMetric("foreground_latency", elapsed); }
      await synchronizeCalendarCache(database, start, end, apiFetch, targetStart ? false : recover, { missingOnly, accountId: connection.accountId, signal: controller.signal, metadataLoaded: Boolean(targetStart) || metadataLoaded, hiddenKeys, requestId: `${requestKey}:${generation}`, isCurrent: () => generation === activeRequest.current }); if (database.isOpen()) client.setQueryData(calendarKeys.calendars(connection), { calendars: await database.calendars.toArray() }); if (generation === activeRequest.current) setError(undefined); return true } catch (cause) { if (generation === activeRequest.current) setError(cause); return null } finally { if (generation === activeRequest.current) setSyncing(false) }
  }, [database, requestKey, online]);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    const recover = Boolean(database && initialized.current !== database.name);
    if (database) initialized.current = database.name;
    void refresh(recover, Boolean(options));
  }, [refresh, database]);

  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (!database || !online) return; return startCalendarRecovery(database, recover => refreshRef.current(recover), () => getConnectivityState() === "online") }, [database, online]);
  useEffect(() => { if (!database || !online) return; void reconcileCalendarMutations(database); const timer = setInterval(() => void reconcileCalendarMutations(database), 30_000); return () => clearInterval(timer) }, [database, online]);
  const cached = useLiveQuery(async () => {
    if (!database || database.identity.userId !== userId || database.identity.workspaceId !== connection.workspaceId || database.identity.bindingId !== connection.bindingId) return { requestKey, calendars: [], events: [], coverage: [], catalogLoaded: false, loaded: false, stale: true };
    // Events and the coverage that unlocks navigation must come from one snapshot.
    return database.transaction("r", database.calendars, database.ranges, database.events, database.state, async () => {
    const calendars = await database.calendars.toArray();
    const hidden = new Set<string>(JSON.parse(hiddenKey));
    const windows = [{ start, end }, ...(separateTarget && targetStart && targetEnd ? [{ start: targetStart, end: targetEnd }] : [])];
    const readable = calendars.filter(c => c.permissions.read && !c.permissions.freeBusyOnly && !hidden.has(JSON.stringify([c.bindingId, c.id])));
    const results = await Promise.all(readable.map(async c => {
      const ranges = await Promise.all(windows.map(w => readCalendarRangeCache(database, c.id, w.start, w.end)));
      const stored = await database.ranges.where("calendarId").equals(c.id).toArray();
      // Coverage is restricted to event windows actually materialized by this read.
      const coverage = stored.flatMap(r => windows.flatMap(w => { const a = Math.max(Date.parse(r.start), Date.parse(w.start)), b = Math.min(Date.parse(r.end), Date.parse(w.end)); return a < b ? [{ start: new Date(a).toISOString(), end: new Date(b).toISOString() }] : []; }));
      return { ranges, calendarId: c.id, coverage };
    }));
    const known = Boolean(await database.state.get("last_recovery"));
    return { requestKey, calendars, events: [...new Map(results.flatMap(r => r.ranges.flatMap(r => r.events)).map(e => [calendarEventKey(e), e])).values()], coverage: results.map(r => ({ calendarId: r.calendarId, ranges: r.coverage })), loaded: known && results.every(r => coversCalendarRange(r.coverage, { start, end })), catalogLoaded: known, stale: results.some(r => r.ranges.some(r => r.stale)) };
    });
  }, [database, materializationKey]);
  return { readLatencyMs, events: cached?.events, calendars: cached?.calendars, coverage: cached?.coverage, catalogLoaded: cached?.catalogLoaded, loaded: cached?.loaded, stale: cached?.stale, requestKey: cached?.requestKey, database, refresh, error, syncing, online };
}
