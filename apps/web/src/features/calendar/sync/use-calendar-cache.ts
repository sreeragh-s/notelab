import { startCalendarRecovery } from "../realtime/calendar-recovery";
import { reconcileCalendarMutations } from "../events/calendar-mutations";
import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { CalendarConnection } from "@zilobase/features/calendar";
import { apiFetch, toApiUrl } from "@/platform/network/api";
import { getConnectivityState, subscribeConnectivity } from "@/features/offline/model";
import { openCalendarDatabase, readCalendarRangeCache, type CalendarDatabase } from "../storage/calendar-database";
import { synchronizeCalendarCache } from "./calendar-cache-sync";
export function useCalendarCache(connection: CalendarConnection, userId: string, start: string, end: string) {
  const [database, setDatabase] = useState<CalendarDatabase | null>(null), [error, setError] = useState<unknown>(), [syncing, setSyncing] = useState(false);
  const online = useSyncExternalStore(subscribeConnectivity, () => getConnectivityState() === "online", () => true);
  useEffect(() => {
    let active = true; setDatabase(null);
    void openCalendarDatabase({ apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin, userId, workspaceId: connection.workspaceId, bindingId: connection.bindingId }).then(db => { if (active) setDatabase(db) }).catch(setError);
    return () => { active = false };
  }, [connection.bindingId, connection.workspaceId, userId]);
  const activeRequest = useRef(0);
  useEffect(() => { activeRequest.current++; return () => { activeRequest.current++ } }, [database, start, end, online]);
  const refresh = useCallback(async (recover = true) => {
    if (!database || !online) return null;
    const generation = ++activeRequest.current; setSyncing(true);
    try { await synchronizeCalendarCache(database, start, end, apiFetch, recover); if (generation === activeRequest.current) setError(undefined); return true } catch (cause) { if (generation === activeRequest.current) setError(cause); return null } finally { if (generation === activeRequest.current) setSyncing(false) }
  }, [database, start, end, online]);
  useEffect(() => { void refresh() }, [refresh]);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => { if (!database || !online) return; return startCalendarRecovery(database, recover => refreshRef.current(recover), () => getConnectivityState() === "online") }, [database, online]);
  useEffect(() => { if (!database || !online) return; void reconcileCalendarMutations(database); const timer = setInterval(() => void reconcileCalendarMutations(database), 30_000); return () => clearInterval(timer) }, [database, online]);
  const cached = useLiveQuery(async () => {
    if (!database) return { calendars: [], events: [], loaded: false, stale: true };
    const calendars = await database.calendars.toArray();
    const ranges = await Promise.all(calendars.map(c => readCalendarRangeCache(database, c.id, start, end)));
    return { calendars, events: ranges.flatMap(r => r.events), loaded: calendars.length > 0 && ranges.every(r => r.loaded), stale: ranges.some(r => r.stale) };
  }, [database, start, end]);
  return { ...cached, database, refresh, error, syncing, online };
}
