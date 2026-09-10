import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { CalendarEventPanel } from "./calendar-event-panel";
import { CalendarStatus } from "./calendar-status";
import { CalendarSurface, type CalendarItem, type CalendarRange } from "@/shared/components/calendar";
import { runCalendarMutation } from "../events/calendar-mutations";
import { toast } from "sonner";
import { newCalendarEvent } from "../events/event-editor";
import { PALETTE, type ColorTokenId } from "@/shared/lib/color-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { calendarDays, todayInZone, dayInstant, addCalendarDays, shiftCalendarPeriod, calendarEventKey, calendarApiBasePath, type CalendarConnection, type CalendarEvent, type CalendarPreferences, type CalendarRecord, type CalendarView } from "@zilobase/features/calendar";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { calendarSelectionKey, calendarIsVisible, resolveDefaultCalendar } from "../connections/calendar-selection";
import { Button } from "@/shared/ui/button";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import type { CalendarDatabase } from "../storage/calendar-database";
type Snapshot = { events: CalendarEvent[]; calendars: CalendarRecord[]; database: CalendarDatabase | null; error?: unknown; loaded: boolean; syncing: boolean; online: boolean; stale: boolean };
function AccountData({ connection, userId, start, end, onData }: { connection: CalendarConnection; userId: string; start: string; end: string; onData: (binding: string, data: Snapshot) => void }) {
  const cache = useCalendarCache(connection, userId, start, end);
  useEffect(() => { onData(connection.bindingId, { events: cache.events ?? [], calendars: cache.calendars ?? [], database: cache.database, error: cache.error, loaded: cache.loaded ?? false, syncing: cache.syncing, online: cache.online, stale: cache.stale ?? true }) }, [connection.bindingId, cache.events, cache.calendars, cache.database, cache.error, cache.loaded, cache.syncing, cache.online, cache.stale, onData]);
  return null;
}
export function CalendarSchedule({ connections, userId, preferences }: { connections: CalendarConnection[]; userId: string; preferences: CalendarPreferences }) {
  const workspace = useCalendarWorkspace();
  const { query } = workspace;
  const search = useSearch({ from: "/app/calendar" }), navigate = useNavigate();
  const view = search.view ?? preferences.view, date = search.date ?? todayInZone(preferences.timeZone);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn), [date, view, preferences.weekStartsOn]);
  const [range, setRange] = useState<CalendarRange | null>(null);
  const cacheStart = range?.start ?? dayInstant(allDays[0]!, preferences.timeZone);
  const cacheEnd = range?.end ?? dayInstant(addCalendarDays(allDays.at(-1)!, 1), preferences.timeZone);
  const start = dayInstant(allDays[0]!, preferences.timeZone), end = dayInstant(addCalendarDays(allDays.at(-1)!, 1), preferences.timeZone);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({}), [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false), [creating, setCreating] = useState(false);
  const [searchEvents, setSearchEvents] = useState<CalendarEvent[] | null>(null), [searchError, setSearchError] = useState<unknown>();
  const onData = useCallback((binding: string, data: Snapshot) => setSnapshots(current => ({ ...current, [binding]: data })), []);
  const data = useMemo(() => connections.flatMap(c => snapshots[c.bindingId] ? [snapshots[c.bindingId]!] : []), [connections, snapshots]);
  const events = useMemo(() => data.flatMap(d => d.events).filter(event => calendarIsVisible(preferences, event.bindingId, event.calendarId) && (preferences.showDeclined || !event.attendees.some(a => a.self && a.responseStatus === "declined"))), [data, preferences]);
  const online = data.every(d => d.online);
  const setPeriod = useCallback((next: string, nextView: CalendarView = view) => { void navigate({ to: "/calendar", search: { date: next, view: nextView } }) }, [navigate, view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.defaultPrevented || (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu],[data-calendar-event-panel]") || e.metaKey || e.ctrlKey || e.altKey) return; if (e.key.toLowerCase() === "t") setPeriod(todayInZone(preferences.timeZone)); if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setPeriod(shiftCalendarPeriod(date, view, e.key === "ArrowLeft" ? -1 : 1)) } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [date, view, preferences.timeZone, setPeriod]);
  useEffect(() => {
    if (!search.event || !search.binding || !search.calendar) return;
    const cached = events.find(e => e.eventId === search.event && e.bindingId === search.binding && e.calendarId === search.calendar); if (cached && !editing) setSelected(cached);
  }, [search.event, search.binding, search.calendar, snapshots]);
  useEffect(() => {
    let active = true; setSearchEvents(null); setSearchError(undefined);
    if (!query.trim() || !online) return;
    const timer = setTimeout(() => { void Promise.all(connections.flatMap(connection => (snapshots[connection.bindingId]?.calendars ?? []).filter(c => calendarIsVisible(preferences, connection.bindingId, c.id)).map(async calendar => {
      const rows: CalendarEvent[] = []; let pageToken: string | null = null;
      do {
        const params: URLSearchParams = new URLSearchParams({ calendarId: calendar.id, start, end, q: query.trim(), ...(pageToken ? { pageToken } : {}) });
        const response: { events: CalendarEvent[]; nextPageToken: string | null } = await apiFetch(`${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(connection.bindingId)}/search?${params}`);
        rows.push(...response.events); pageToken = response.nextPageToken;
      } while (active && pageToken);
      return rows;
    }))).then(results => { if (active) setSearchEvents(results.flat()) }).catch(error => { if (active) setSearchError(error) }) }, 350);
    return () => { active = false; clearTimeout(timer) };
  }, [query, online, start, end, connections, preferences.hiddenCalendarKeys, preferences.removedCalendarKeys]);
  const visible = useMemo(() => query ? (searchEvents?.filter(event => calendarIsVisible(preferences, event.bindingId, event.calendarId)) ?? events.filter(e => `${e.title} ${e.description} ${e.location}`.toLowerCase().includes(query.toLowerCase()))) : events, [query, searchEvents, events, preferences]);
  const open = (event: CalendarEvent) => { workspace.openPanel(); setEditing(false); setCreating(false); setSelected(event); void navigate({ to: "/calendar", search: { date, view, binding: event.bindingId, calendar: event.calendarId, event: event.eventId } }) };
  const create = (day = date, hour = 9, duration = 30) => {
    const writable = data.flatMap(d => d.calendars).filter(c => c.permissions.write);
    const calendar = resolveDefaultCalendar(writable, preferences);
    if (!calendar) return;
    const connection = connections.find(c => c.bindingId === calendar.bindingId)!;
    let seed: CalendarEvent;
    try { seed = newCalendarEvent({ ...connection, calendarId: calendar.id, date: day, hour, timeZone: preferences.timeZone }); } catch (error) { toast.error(getApiErrorMessage(error)); return }
    workspace.openPanel();
    setSelected({ ...seed, end: { dateTime: new Date(Date.parse(seed.start.dateTime!) + duration * 60000).toISOString(), timeZone: preferences.timeZone } }); setEditing(true); setCreating(true);
  };
  const changeGeometry = async (event: CalendarEvent) => {
    const snapshot = snapshots[event.bindingId]; if (!online || !snapshot?.database) return;
    if (event.recurringEventId || event.attendees.length) { workspace.openPanel(); setSelected(event); setCreating(false); setEditing(true); return }
    try { await runCalendarMutation({ database: snapshot.database, event, action: "update", write: { operationId: crypto.randomUUID(), etag: event.etag, sendUpdates: "all", event: { start: event.start, end: event.end } } }) } catch (error) { toast.error(getApiErrorMessage(error)) }
  };
  const color = (event: CalendarEvent) => {
    const override = preferences.calendarColors?.[calendarSelectionKey(event.bindingId, event.calendarId)];
    if (!event.colorId && override) return PALETTE[override];
    const providerColor = event.colorId ?? data.flatMap(d => d.calendars).find(c => c.id === event.calendarId && c.bindingId === event.bindingId)?.colorId;
    const hues: ColorTokenId[] = ["blue", "purple", "green", "purple", "red", "yellow", "orange", "blue", "gray", "blue", "green", "red"];
    return PALETTE[hues[Number(providerColor ?? 0) % hues.length] ?? "blue"];
  };
  const close = () => { setSelected(null); setEditing(false); setCreating(false); void navigate({ to: "/calendar", search: { date, view } }); };
  useEffect(() => workspace.register({ close, create: () => create() }));
  useEffect(() => { if (search.event) workspace.openPanel(); }, [search.event, workspace.openPanel]);
  const selection = selectionData(selected, snapshots, connections);
  const items = useMemo<CalendarItem[]>(() => visible.map(event => ({
    id: calendarEventKey(event), title: event.title, start: event.start, end: event.end,
    ...color(event), dashed: event.attendees.some(a => a.self && a.responseStatus === "needsAction"),
    editable: online && data.flatMap(d => d.calendars).some(c => c.id === event.calendarId && c.bindingId === event.bindingId && c.permissions.write),
  })), [visible, data, preferences, online]);
  const selectItem = (item: CalendarItem) => { const event = visible.find(event => calendarEventKey(event) === item.id); if (event) open(event); };
  const changeItem = (item: CalendarItem) => { const event = visible.find(event => calendarEventKey(event) === item.id); if (event) void changeGeometry({ ...event, start: item.start, end: item.end }); };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {connections.map(c => <AccountData key={c.bindingId} connection={c} userId={userId} start={cacheStart} end={cacheEnd} onData={onData} />)}
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-default px-4 py-3">
      <h1 className="min-w-0 truncate text-xl font-semibold">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</h1>
      <Button className="shrink-0" disabled={!online || !Boolean(resolveDefaultCalendar(data.flatMap(d => d.calendars), preferences))} onClick={() => create()}>Create event</Button>
    </div>
    <CalendarStatus data={data} online={online} error={searchError} />
    <CalendarSurface items={items} date={date} view={view} agenda={Boolean(query)} preferences={preferences} onNavigate={setPeriod} onRangeChange={setRange} onSelect={selectItem} onCreate={online ? create : undefined} onChange={changeItem} onError={error => toast.error(error.message)} />
    <CalendarEventPanel selected={selection.event} database={selection.database} calendars={selection.calendars} online={online} editing={editing} creating={creating} zone={preferences.timeZone} timeFormat={preferences.timeFormat} onClose={workspace.closePanel} onEdit={() => setEditing(true)} onDuplicate={() => { if (!selected) return; setSelected({ ...selected, eventId: `local-${crypto.randomUUID()}`, etag: "", title: `${selected.title} (copy)`, attendees: [], recurringEventId: undefined, originalStartTime: undefined, recurrence: undefined }); setCreating(true); setEditing(true) }} />
  </div>;
}

function selectionData(event: CalendarEvent | null, snapshots: Record<string, Snapshot>, connections: CalendarConnection[]) {
 if (!event || !connections.some(c => c.bindingId === event.bindingId)) return { event: null, database: null, calendars: [] };
 const snapshot = snapshots[event.bindingId]; return { event, database: snapshot?.database ?? null, calendars: snapshot?.calendars ?? [] };
}
