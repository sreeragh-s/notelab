import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { addCalendarDays, calendarApiBasePath, calendarEventKey, dayInstant, eventClock, eventInstant, type CalendarConnection, type CalendarEvent, type CalendarPreferences, type CalendarRecord } from "@zilobase/features/calendar";
import { calendarIsVisible, calendarSelectionKey } from "../connections/calendar-selection";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
type Cursor = { source: number; token?: string };
export function CalendarSearchResults({ query, connections, calendars, preferences, cached, online, userId, onSelect }: { query: string; connections: CalendarConnection[]; calendars: CalendarRecord[]; preferences: CalendarPreferences; cached: CalendarEvent[]; online: boolean; userId: string; onSelect: (event: CalendarEvent) => void }) {
  const [debounced, setDebounced] = useState(""), [source, setSource] = useState("all"), [from, setFrom] = useState(""), [until, setUntil] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  const readable = calendars.filter(calendar => calendar.permissions.read && !calendar.permissions.freeBusyOnly);
  const sources = readable.flatMap(calendar => {
    const connection = connections.find(connection => connection.bindingId === calendar.bindingId);
    return connection && (source === "all" ? calendarIsVisible(preferences, calendar.bindingId, calendar.id) : source === calendarSelectionKey(calendar.bindingId, calendar.id)) ? [{ calendar, connection }] : [];
  }).sort((a, b) => calendarSelectionKey(a.calendar.bindingId, a.calendar.id).localeCompare(calendarSelectionKey(b.calendar.bindingId, b.calendar.id)));
  const invalidRange = Boolean(from && until && until < from);
  const results = useInfiniteQuery({
    queryKey: ["calendar", "search", userId, sources.map(({ connection, calendar }) => [connection.workspaceId, connection.bindingId, calendar.id]), debounced, from, until, preferences.timeZone],
    enabled: online && Boolean(debounced) && query.trim() === debounced && sources.length > 0 && !invalidRange,
    initialPageParam: { source: 0 } as Cursor,
    queryFn: async ({ pageParam, signal }) => {
      const selected = sources[pageParam.source]!;
      const params = new URLSearchParams({ q: debounced, calendarId: selected.calendar.id, ...(from ? { start: dayInstant(from, preferences.timeZone) } : {}), ...(until ? { end: dayInstant(addCalendarDays(until, 1), preferences.timeZone) } : {}), ...(pageParam.token ? { pageToken: pageParam.token } : {}) });
      const page = await apiFetch<{ events: CalendarEvent[]; nextPageToken: string | null }>(`${calendarApiBasePath(selected.connection.workspaceId)}/connections/${encodeURIComponent(selected.connection.bindingId)}/search?${params}`, { signal });
      return { ...page, source: pageParam.source };
    },
    getNextPageParam: page => page.nextPageToken ? { source: page.source, token: page.nextPageToken } : page.source + 1 < sources.length ? { source: page.source + 1 } : undefined,
    staleTime: 30_000,
  });
  const loaded = searchLoadedEvents(online, query, debounced, results.data?.pages.flatMap(page => page.events) ?? [], cached);
  const events = uniqueSearchEvents(loaded.filter(event => matchesSearchEvent(event, sources, preferences, from, until)), preferences.timeZone);
  return <section aria-label="Calendar search results" className="min-h-0 flex-1 overflow-y-auto p-4">
    <div className="mb-4 flex flex-wrap items-end gap-3"><Select value={source} onValueChange={setSource}><SelectTrigger aria-label="Search source" className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All visible calendars</SelectItem>{readable.map(calendar => <SelectItem key={calendarSelectionKey(calendar.bindingId, calendar.id)} value={calendarSelectionKey(calendar.bindingId, calendar.id)}>{calendar.name} · {connections.find(connection => connection.bindingId === calendar.bindingId)?.email}</SelectItem>)}</SelectContent></Select><label className="text-xs">From<Input aria-label="Search from date" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="text-xs">Through<Input aria-label="Search through date" type="date" value={until} onChange={event => setUntil(event.target.value)} /></label></div>
    {invalidRange && <p role="alert">The end date must not precede the start date.</p>}
    {!online && <p role="status">Offline: searching cached events only.</p>}
    {results.error && <div role="alert">{getApiErrorMessage(results.error)}<Button variant="outline" onClick={() => void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch())}>Retry search</Button></div>}
    <ul className="grid gap-2">{events.map(event => <li key={calendarEventKey(event)}><Button variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onSelect(event)}><span>{event.title}<span className="block text-xs text-content-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: preferences.timeZone }).format(new Date(eventInstant(event.start, preferences.timeZone)))} · {eventClock(event.start, preferences.timeZone, preferences.timeFormat)}</span></span></Button></li>)}</ul>
    {results.isFetching || query.trim() !== debounced ? <p role="status">Searching…</p> : !events.length && !invalidRange && <p>No matching events.</p>}
    {online && results.hasNextPage && <Button className="mt-3" disabled={results.isFetching} onClick={() => void results.fetchNextPage()}>Load more results</Button>}
  </section>;
}
function searchLoadedEvents(online: boolean, query: string, debounced: string, pages: CalendarEvent[], cached: CalendarEvent[]) {
  if (!online) return cached.filter(event => `${event.title} ${event.description} ${event.location}`.toLowerCase().includes(query.toLowerCase()));
  if (query.trim() !== debounced) return [];
  return pages;
}
function matchesSearchEvent(event: CalendarEvent, sources: { calendar: CalendarRecord }[], preferences: CalendarPreferences, from: string, until: string) {
  if (event.status === "cancelled") return false;
  if (!sources.some(({ calendar }) => calendar.id === event.calendarId && calendar.bindingId === event.bindingId)) return false;
  if (!preferences.showDeclined && event.attendees.some(attendee => attendee.self && attendee.responseStatus === "declined")) return false;
  return matchesSearchRange(event, preferences.timeZone, from, until);
}
function matchesSearchRange(event: CalendarEvent, zone: string, from: string, until: string) {
  if (from && Date.parse(eventInstant(event.end, zone)) <= Date.parse(dayInstant(from, zone))) return false;
  if (until && Date.parse(eventInstant(event.start, zone)) >= Date.parse(dayInstant(addCalendarDays(until, 1), zone))) return false;
  return true;
}
function uniqueSearchEvents(events: CalendarEvent[], zone: string) {
  return [...new Map(events.map(event => [calendarEventKey(event), event])).values()].sort((a, b) => Date.parse(eventInstant(a.start, zone)) - Date.parse(eventInstant(b.start, zone)));
}
