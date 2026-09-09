import { CalendarEventSheet } from "./calendar-event-sheet";
import { CalendarStatus } from "./calendar-status";
import { CalendarPeriodScroller } from "./calendar-period-scroller";
import { CalendarMonthView } from "./calendar-month-view";
import { runCalendarMutation } from "../events/calendar-mutations";
import { toast } from "sonner";
import { newCalendarEvent } from "../events/event-editor";
import { PALETTE, type ColorTokenId } from "@/shared/lib/color-tokens";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { calendarDays, todayInZone, dayInstant, addCalendarDays, shiftCalendarPeriod, calendarEventKey, eventInstant, eventClock, calendarApiBasePath, type CalendarConnection, type CalendarEvent, type CalendarPreferences, type CalendarRecord, type CalendarView } from "@zilobase/features/calendar";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { calendarSelectionKey, calendarIsVisible, resolveDefaultCalendar } from "../connections/calendar-selection";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { ChevronLeftIcon, ChevronRightIcon } from "@/shared/components/icons";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { DateCalendar as Calendar } from "@/shared/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import type { CalendarDatabase } from "../storage/calendar-database";
type Snapshot = { events: CalendarEvent[]; calendars: CalendarRecord[]; database: CalendarDatabase | null; error?: unknown; loaded: boolean; syncing: boolean; online: boolean; stale: boolean };
function AccountData({ connection, userId, start, end, onData }: { connection: CalendarConnection; userId: string; start: string; end: string; onData: (binding: string, data: Snapshot) => void }) {
  const cache = useCalendarCache(connection, userId, start, end);
  useEffect(() => { onData(connection.bindingId, { events: cache.events ?? [], calendars: cache.calendars ?? [], database: cache.database, error: cache.error, loaded: cache.loaded ?? false, syncing: cache.syncing, online: cache.online, stale: cache.stale ?? true }) }, [connection.bindingId, cache.events, cache.calendars, cache.database, cache.error, cache.loaded, cache.syncing, cache.online, cache.stale, onData]);
  return null;
}
export function CalendarSchedule({ connections, userId, preferences }: { connections: CalendarConnection[]; userId: string; preferences: CalendarPreferences }) {
  const gridScroll = useRef<HTMLDivElement>(null);
  const search = useSearch({ from: "/app/calendar" }), navigate = useNavigate();
  const view = search.view ?? preferences.view, date = search.date ?? todayInZone(preferences.timeZone);
  useEffect(() => { if (gridScroll.current) gridScroll.current.scrollTop = 7 * 48 }, [view]);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn), [date, view, preferences.weekStartsOn]);
  const periods = useMemo(() => [-1, 0, 1].map(direction => calendarDays(shiftCalendarPeriod(date, view, direction), view, preferences.weekStartsOn).filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))), [date, view, preferences.weekStartsOn, preferences.showWeekends]);
  const loadedDays = view === "day" || view === "week" ? periods.flat() : allDays;
  const cacheStart = dayInstant(loadedDays[0]!, preferences.timeZone), cacheEnd = dayInstant(addCalendarDays(loadedDays.at(-1)!, 1), preferences.timeZone);
  const days = allDays.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()));
  const start = dayInstant(allDays[0]!, preferences.timeZone), end = dayInstant(addCalendarDays(allDays.at(-1)!, 1), preferences.timeZone);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({}), [query, setQuery] = useState(""), [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false), [creating, setCreating] = useState(false);
  const [searchEvents, setSearchEvents] = useState<CalendarEvent[] | null>(null), [searchError, setSearchError] = useState<unknown>();
  const onData = useCallback((binding: string, data: Snapshot) => setSnapshots(current => ({ ...current, [binding]: data })), []);
  const data = connections.flatMap(c => snapshots[c.bindingId] ? [snapshots[c.bindingId]!] : []);
  const events = data.flatMap(d => d.events).filter(event => calendarIsVisible(preferences, event.bindingId, event.calendarId) && (preferences.showDeclined || !event.attendees.some(a => a.self && a.responseStatus === "declined")));
  const online = data.every(d => d.online), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, []);
  const setPeriod = useCallback((next: string, nextView: CalendarView = view) => { void navigate({ to: "/calendar", search: { date: next, view: nextView } }) }, [navigate, view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.defaultPrevented || (e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu]") || e.metaKey || e.ctrlKey || e.altKey) return; if (e.key.toLowerCase() === "t") setPeriod(todayInZone(preferences.timeZone)); if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setPeriod(shiftCalendarPeriod(date, view, e.key === "ArrowLeft" ? -1 : 1)) } };
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
  const visible = query ? (searchEvents?.filter(event => calendarIsVisible(preferences, event.bindingId, event.calendarId)) ?? events.filter(e => `${e.title} ${e.description} ${e.location}`.toLowerCase().includes(query.toLowerCase()))) : events;
  const eventsByDay = useMemo(() => {
    const periods = loadedDays.map(day => ({ day, start: Date.parse(dayInstant(day, preferences.timeZone)), end: Date.parse(dayInstant(addCalendarDays(day, 1), preferences.timeZone)), events: [] as CalendarEvent[] }));
    for (const event of visible) {
      const from = Date.parse(eventInstant(event.start, preferences.timeZone)), until = Date.parse(eventInstant(event.end, preferences.timeZone));
      for (const period of periods) if (from < period.end && until > period.start) period.events.push(event);
    }
    return Object.fromEntries(periods.map(period => [period.day, period.events]));
  }, [visible, loadedDays, preferences.timeZone]);
  const open = (event: CalendarEvent) => { setEditing(false); setCreating(false); setSelected(event); void navigate({ to: "/calendar", search: { date, view, binding: event.bindingId, calendar: event.calendarId, event: event.eventId } }) };
  const create = (day = date, hour = 9, duration = 30) => {
    const writable = data.flatMap(d => d.calendars).filter(c => c.permissions.write);
    const calendar = resolveDefaultCalendar(writable, preferences);
    if (!calendar) return;
    const connection = connections.find(c => c.bindingId === calendar.bindingId)!;
    let seed: CalendarEvent;
    try { seed = newCalendarEvent({ ...connection, calendarId: calendar.id, date: day, hour, timeZone: preferences.timeZone }); } catch (error) { toast.error(getApiErrorMessage(error)); return }
    setSelected({ ...seed, end: { dateTime: new Date(Date.parse(seed.start.dateTime!) + duration * 60000).toISOString(), timeZone: preferences.timeZone } }); setEditing(true); setCreating(true);
  };
  const changeGeometry = async (event: CalendarEvent) => {
    const snapshot = snapshots[event.bindingId]; if (!online || !snapshot?.database) return;
    if (event.recurringEventId || event.attendees.length) { setSelected(event); setCreating(false); setEditing(true); return }
    try { await runCalendarMutation({ database: snapshot.database, event, action: "update", write: { operationId: crypto.randomUUID(), etag: event.etag, sendUpdates: "all", event: { start: event.start, end: event.end } } }) } catch (error) { toast.error(getApiErrorMessage(error)) }
  };
  const color = (event: CalendarEvent) => {
    const override = preferences.calendarColors?.[calendarSelectionKey(event.bindingId, event.calendarId)];
    if (!event.colorId && override) return PALETTE[override];
    const providerColor = event.colorId ?? data.flatMap(d => d.calendars).find(c => c.id === event.calendarId && c.bindingId === event.bindingId)?.colorId;
    const hues: ColorTokenId[] = ["blue", "purple", "green", "purple", "red", "yellow", "orange", "blue", "gray", "blue", "green", "red"];
    return PALETTE[hues[Number(providerColor ?? 0) % hues.length] ?? "blue"];
  };
  const selection = selectionData(selected, snapshots, connections);
  const card = (event: CalendarEvent) => <Button key={calendarEventKey(event)} draggable={view === "month" && online && !event.start.date} onDragStart={e => e.dataTransfer.setData("text/calendar-event", calendarEventKey(event))} variant="ghost" className={`h-auto w-full justify-start overflow-hidden rounded-sm px-1.5 py-1 text-left text-xs font-normal ${color(event).backgroundClass} ${color(event).textClass}`} onClick={() => open(event)} title={event.title}><span className="truncate">{!event.start.date && <span className="mr-1 text-content-secondary">{eventClock(event.start, preferences.timeZone, preferences.timeFormat)}</span>}{event.title}</span></Button>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {connections.map(c => <AccountData key={c.bindingId} connection={c} userId={userId} start={cacheStart} end={cacheEnd} onData={onData} />)}
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stroke-default p-3"><Button variant="outline" onClick={() => setPeriod(todayInZone(preferences.timeZone))}>Today</Button><Button variant="ghost" size="icon" aria-label="Previous period" onClick={() => setPeriod(shiftCalendarPeriod(date, view, -1))}><ChevronLeftIcon /></Button><Button variant="ghost" size="icon" aria-label="Next period" onClick={() => setPeriod(shiftCalendarPeriod(date, view, 1))}><ChevronRightIcon /></Button>
      <Popover><PopoverTrigger asChild><Button variant="ghost">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={new Date(`${date}T12:00:00`)} onSelect={day => { if (day) setPeriod(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`) }} /></PopoverContent></Popover>
      <Button disabled={!online || !Boolean(resolveDefaultCalendar(data.flatMap(d => d.calendars), preferences))} onClick={() => create()}>Create event</Button><Input className="ml-auto w-44" aria-label="Search calendar" placeholder="Search events" value={query} onChange={e => setQuery(e.target.value)} /><Select value={view} onValueChange={next => setPeriod(date, next as CalendarView)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{(["day", "week", "month", "agenda"] as const).map(v => <SelectItem key={v} value={v}>{v[0]!.toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select>
    </div>
    <CalendarStatus data={data} online={online} error={searchError} />
    {view === "agenda" || query ? <div data-calendar-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">{days.map(day => { const rows = eventsByDay[day] ?? []; return <section key={day} className="mb-5"><h2 className="mb-2 text-sm font-medium">{day}</h2>{rows.length ? rows.map(card) : <p className="text-xs text-content-secondary">No events</p>}</section> })}</div> : view === "month" ? <CalendarMonthView days={days} eventsByDay={eventsByDay} preferences={preferences} online={online} writable={event => data.flatMap(d => d.calendars).some(c => c.id === event.calendarId && c.bindingId === event.bindingId && c.permissions.write)} card={card} onDay={day => setPeriod(day, "day")} onChange={event => void changeGeometry(event)} /> : <CalendarPeriodScroller periods={periods} periodKey={`${view}:${date}`} onPeriod={direction => setPeriod(shiftCalendarPeriod(date, view, direction))} eventsByDay={eventsByDay} preferences={preferences} now={now} online={online} scrollRef={gridScroll} card={card} writable={event => data.flatMap(d => d.calendars).some(c => c.id === event.calendarId && c.bindingId === event.bindingId && c.permissions.write)} onDay={day => setPeriod(day, "day")} onCreate={create} onChange={event => void changeGeometry(event)} background={event => color(event).backgroundClass} />}
    <CalendarEventSheet selected={selection.event} database={selection.database} calendars={selection.calendars} online={online} editing={editing} creating={creating} zone={preferences.timeZone} timeFormat={preferences.timeFormat} onClose={() => { setSelected(null); setEditing(false); void navigate({ to: "/calendar", search: { date, view } }) }} onEdit={() => setEditing(true)} onDuplicate={() => { if (!selected) return; setSelected({ ...selected, eventId: `local-${crypto.randomUUID()}`, etag: "", title: `${selected.title} (copy)`, attendees: [], recurringEventId: undefined, originalStartTime: undefined, recurrence: undefined }); setCreating(true); setEditing(true) }} />
  </div>;
}

function selectionData(event: CalendarEvent | null, snapshots: Record<string, Snapshot>, connections: CalendarConnection[]) {
 if (!event || !connections.some(c => c.bindingId === event.bindingId)) return { event: null, database: null, calendars: [] };
 const snapshot = snapshots[event.bindingId]; return { event, database: snapshot?.database ?? null, calendars: snapshot?.calendars ?? [] };
}
