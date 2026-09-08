import { PALETTE, type ColorTokenId } from "@/shared/lib/color-tokens";
import { getISOWeek } from "date-fns";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { calendarDays, todayInZone, dayInstant, addCalendarDays, shiftCalendarPeriod, calendarEventKey, eventOverlaps, eventClock, timedLayout, calendarApiBasePath, type CalendarConnection, type CalendarEvent, type CalendarPreferences, type CalendarRecord, type CalendarView } from "@zilobase/features/calendar";
import { useCalendarCache } from "../sync/use-calendar-cache";
import { calendarSelectionKey } from "../connections/calendar-list";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
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
  useEffect(() => { if (gridScroll.current) gridScroll.current.scrollTop = 7 * 48 }, [view, date]);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn), [date, view, preferences.weekStartsOn]);
  const days = allDays.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()));
  const start = dayInstant(allDays[0]!, preferences.timeZone), end = dayInstant(addCalendarDays(allDays.at(-1)!, 1), preferences.timeZone);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({}), [query, setQuery] = useState(""), [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [searchEvents, setSearchEvents] = useState<CalendarEvent[] | null>(null), [searchError, setSearchError] = useState<unknown>();
  const onData = useCallback((binding: string, data: Snapshot) => setSnapshots(current => ({ ...current, [binding]: data })), []);
  const data = connections.flatMap(c => snapshots[c.bindingId] ? [snapshots[c.bindingId]!] : []);
  const events = data.flatMap(d => d.events).filter(event => !preferences.hiddenCalendarKeys.includes(calendarSelectionKey(event.bindingId, event.calendarId)) && (preferences.showDeclined || !event.attendees.some(a => a.self && a.responseStatus === "declined")));
  const online = data.every(d => d.online), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, []);
  const setPeriod = useCallback((next: string, nextView: CalendarView = view) => { void navigate({ to: "/calendar", search: { date: next, view: nextView } }) }, [navigate, view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true],[role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return; if (e.key.toLowerCase() === "t") setPeriod(todayInZone(preferences.timeZone)); if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setPeriod(shiftCalendarPeriod(date, view, e.key === "ArrowLeft" ? -1 : 1)) } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [date, view, preferences.timeZone, setPeriod]);
  useEffect(() => {
    if (!search.event || !search.binding || !search.calendar) return;
    const cached = events.find(e => e.eventId === search.event && e.bindingId === search.binding && e.calendarId === search.calendar); if (cached) setSelected(cached);
  }, [search.event, search.binding, search.calendar, snapshots]);
  useEffect(() => {
    let active = true; setSearchEvents(null); setSearchError(undefined);
    if (!query.trim() || !online) return;
    const timer = setTimeout(() => { void Promise.all(connections.flatMap(connection => (snapshots[connection.bindingId]?.calendars ?? []).filter(c => !preferences.hiddenCalendarKeys.includes(calendarSelectionKey(connection.bindingId, c.id))).map(async calendar => {
      const rows: CalendarEvent[] = []; let pageToken: string | null = null;
      do {
        const params: URLSearchParams = new URLSearchParams({ calendarId: calendar.id, start, end, q: query.trim(), ...(pageToken ? { pageToken } : {}) });
        const response: { events: CalendarEvent[]; nextPageToken: string | null } = await apiFetch(`${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(connection.bindingId)}/search?${params}`);
        rows.push(...response.events); pageToken = response.nextPageToken;
      } while (active && pageToken);
      return rows;
    }))).then(results => { if (active) setSearchEvents(results.flat()) }).catch(error => { if (active) setSearchError(error) }) }, 350);
    return () => { active = false; clearTimeout(timer) };
  }, [query, online, start, end, connections, preferences.hiddenCalendarKeys]);
  const visible = query ? (searchEvents ?? events.filter(e => `${e.title} ${e.description} ${e.location}`.toLowerCase().includes(query.toLowerCase()))) : events;
  const open = (event: CalendarEvent) => { setSelected(event); void navigate({ to: "/calendar", search: { date, view, binding: event.bindingId, calendar: event.calendarId, event: event.eventId } }) };
  const color = (event: CalendarEvent) => {
    const providerColor = event.colorId ?? data.flatMap(d => d.calendars).find(c => c.id === event.calendarId && c.bindingId === event.bindingId)?.colorId;
    const hues: ColorTokenId[] = ["blue", "purple", "green", "purple", "red", "yellow", "orange", "blue", "gray", "blue", "green", "red"];
    return PALETTE[hues[Number(providerColor ?? 0) % hues.length] ?? "blue"];
  };
  const card = (event: CalendarEvent) => <Button key={calendarEventKey(event)} variant="ghost" className={`h-auto w-full justify-start overflow-hidden rounded-sm px-1.5 py-1 text-left text-xs font-normal ${color(event).backgroundClass} ${color(event).textClass}`} onClick={() => open(event)} title={event.title}><span className="truncate">{!event.start.date && <span className="mr-1 text-content-secondary">{eventClock(event.start, preferences.timeZone, preferences.timeFormat)}</span>}{event.title}</span></Button>;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {connections.map(c => <AccountData key={c.bindingId} connection={c} userId={userId} start={start} end={end} onData={onData} />)}
    <div className="flex flex-wrap items-center gap-2 border-b border-stroke-default p-3"><Button variant="outline" onClick={() => setPeriod(todayInZone(preferences.timeZone))}>Today</Button><Button variant="ghost" size="icon" aria-label="Previous period" onClick={() => setPeriod(shiftCalendarPeriod(date, view, -1))}><ChevronLeftIcon /></Button><Button variant="ghost" size="icon" aria-label="Next period" onClick={() => setPeriod(shiftCalendarPeriod(date, view, 1))}><ChevronRightIcon /></Button>
      <Popover><PopoverTrigger asChild><Button variant="ghost">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={new Date(`${date}T12:00:00`)} onSelect={day => { if (day) setPeriod(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`) }} /></PopoverContent></Popover>
      <Input className="ml-auto w-44" aria-label="Search calendar" placeholder="Search events" value={query} onChange={e => setQuery(e.target.value)} /><Select value={view} onValueChange={next => setPeriod(date, next as CalendarView)}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{(["day", "week", "month", "agenda"] as const).map(v => <SelectItem key={v} value={v}>{v[0]!.toUpperCase() + v.slice(1)}</SelectItem>)}</SelectContent></Select>
    </div>
    <div role="status" className="flex shrink-0 gap-2 px-3 py-1 text-xs text-content-secondary"><span>{[preferences.timeZone, ...preferences.secondaryTimeZones].join(" · ")}</span>{!online ? "Offline · cached events only" : data.some(d => d.syncing) ? "Syncing…" : data.some(d => d.stale) ? "Cached schedule · refreshing" : "Up to date"}{data.some(d => !d.loaded) && !online && " · Some dates are not cached"}</div>
    {(searchError || data.find(d => d.error)?.error) ? <p role="alert" className="px-3 text-sm text-feedback-danger-text">{getApiErrorMessage(searchError ?? data.find(d => d.error)!.error)}</p> : null}
    {view === "agenda" || query ? <div className="flex-1 overflow-auto p-4">{days.map(day => { const rows = visible.filter(e => eventOverlaps(e, dayInstant(day, preferences.timeZone), dayInstant(addCalendarDays(day, 1), preferences.timeZone), preferences.timeZone)); return <section key={day} className="mb-5"><h2 className="mb-2 text-sm font-medium">{day}</h2>{rows.length ? rows.map(card) : <p className="text-xs text-content-secondary">No events</p>}</section> })}</div> : view === "month" ? <div className="grid min-h-0 flex-1 overflow-auto" style={{ gridTemplateColumns: `repeat(${preferences.showWeekends ? 7 : 5}, minmax(0, 1fr))` }}>{days.map(day => { const rows = visible.filter(e => eventOverlaps(e, dayInstant(day, preferences.timeZone), dayInstant(addCalendarDays(day, 1), preferences.timeZone), preferences.timeZone)); return <div key={day} className="min-h-28 space-y-1 border-b border-r border-stroke-default p-1"><Button size="sm" variant="ghost" onClick={() => setPeriod(day, "day")}>{day.slice(-2)}{preferences.showWeekNumbers && <span className="ml-1 text-[10px] text-content-secondary">W{getISOWeek(new Date(`${day}T12:00:00Z`))}</span>}</Button>{rows.slice(0, 3).map(card)}{rows.length > 3 && <Popover><PopoverTrigger asChild><Button size="sm" variant="ghost">+{rows.length - 3} more</Button></PopoverTrigger><PopoverContent>{rows.map(card)}</PopoverContent></Popover>}</div> })}</div> : <div ref={gridScroll} className="min-h-0 flex-1 overflow-auto"><div className="min-w-[560px]">
      <div className="sticky top-0 z-10 grid border-b border-stroke-default bg-surface-canvas" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}><div className="p-2 text-xs text-content-secondary">All day</div>{days.map(day => <div key={day} className="border-l border-stroke-default p-1"><Button size="sm" variant="ghost" className="w-full" onClick={() => setPeriod(day, "day")}>{new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</Button>{visible.filter(e => e.start.date && eventOverlaps(e, dayInstant(day, preferences.timeZone), dayInstant(addCalendarDays(day, 1), preferences.timeZone), preferences.timeZone)).map(card)}</div>)}</div>
      <div className="grid" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}><div>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 pr-2 text-right text-[10px] text-content-secondary">{preferences.timeFormat === "24" ? `${String(hour).padStart(2, "0")}:00` : `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`}</div>)}</div>{days.map(day => <div key={day} className="relative h-[1152px] border-l border-stroke-default">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-12 border-t border-data-grid" />)}{timedLayout(visible, day, preferences.timeZone).map(item => <div key={calendarEventKey(item.event)} className={`absolute overflow-hidden border-l-2 border-stroke-default ${color(item.event).backgroundClass}`} style={{ top: item.top * .8, height: Math.max(18, (item.bottom - item.top) * .8), left: `${item.column / item.columns * 100}%`, width: `${100 / item.columns}%` }}>{card(item.event)}</div>)}{day === todayInZone(preferences.timeZone) && <div className="pointer-events-none absolute inset-x-0 border-t border-feedback-danger-text" style={{ top: Number(new Intl.DateTimeFormat("en-GB", { timeZone: preferences.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now)).split(":").reduce((sum, value, i) => sum + Number(value) * (i === 0 ? 60 : 1), 0)) * .8 }} />}</div>)}</div>
    </div></div>}
    <Sheet open={Boolean(selected)} onOpenChange={open => { if (!open) { setSelected(null); void navigate({ to: "/calendar", search: { date, view } }) } }}><SheetContent className="overflow-y-auto p-5" aria-describedby={undefined}><SheetTitle>{selected?.title}</SheetTitle>{selected && <div className="mt-5 grid gap-4 text-sm"><p>{selected.start.date ?? new Date(selected.start.dateTime!).toLocaleString(undefined, { timeZone: preferences.timeZone })} — {eventClock(selected.end, preferences.timeZone, preferences.timeFormat)}</p><p>{selected.location}</p><p className="whitespace-pre-wrap">{selected.description}</p>{selected.attendees.map(a => <p key={a.email}>{a.email} · {a.responseStatus}</p>)}{selected.conferenceUrl && /^https:\/\//.test(selected.conferenceUrl) && <a className="underline" href={selected.conferenceUrl} target="_blank" rel="noopener noreferrer">Join meeting</a>}{/^https:\/\//.test(selected.htmlLink) && <a className="underline" href={selected.htmlLink} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>}</div>}</SheetContent></Sheet>
  </div>;
}
