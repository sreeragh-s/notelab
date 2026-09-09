import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEventTime, CalendarEvent, CalendarView } from "./contracts";
export function calendarDate(time: CalendarEventTime, zone: string) { return time.date ?? Temporal.Instant.from(time.dateTime!).toZonedDateTimeISO(zone).toPlainDate().toString() }
export function dayInstant(date: string, zone: string) { return Temporal.PlainDate.from(date).toZonedDateTime(zone).toInstant().toString() }
export function addCalendarDays(date: string, days: number) { return Temporal.PlainDate.from(date).add({ days }).toString() }
export function todayInZone(zone: string) { return Temporal.Now.plainDateISO(zone).toString() }
export function wallTime(date: string, time: string, zone: string, choice: "reject" | "earlier" | "later" = "reject") {
  return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone, { disambiguation: choice }).toInstant().toString();
}
export function eventInstant(time: CalendarEventTime, zone: string) { return time.date ? dayInstant(time.date, zone) : time.dateTime! }
export function eventOverlaps(event: CalendarEvent, start: string, end: string, zone: string) { return Date.parse(eventInstant(event.start, zone)) < Date.parse(end) && Date.parse(eventInstant(event.end, zone)) > Date.parse(start) }
export function calendarDays(date: string, view: CalendarView, weekStartsOn: number) {
  const anchor = Temporal.PlainDate.from(date);
  if (view === "day") return [date];
  if (view === "agenda") return Array.from({ length: 30 }, (_, i) => anchor.add({ days: i }).toString());
  const first = view === "month" ? anchor.with({ day: 1 }) : anchor;
  const offset = (first.dayOfWeek % 7 - weekStartsOn + 7) % 7, start = first.subtract({ days: offset });
  return Array.from({ length: view === "month" ? Math.ceil((offset + anchor.daysInMonth) / 7) * 7 : 7 }, (_, i) => start.add({ days: i }).toString());
}
export function shiftCalendarPeriod(date: string, view: CalendarView, direction: number) { return Temporal.PlainDate.from(date).add(view === "month" ? { months: direction } : { days: direction * (view === "day" ? 1 : view === "agenda" ? 30 : 7) }).toString() }
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
function clockFormatter(zone: string, format: "12" | "24") {
  const key = `${zone}:${format}`;
  let formatter = clockFormatters.get(key);
  if (!formatter) { formatter = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: format === "12" }); clockFormatters.set(key, formatter) }
  return formatter;
}
export function eventClock(time: CalendarEventTime, zone: string, format: "12" | "24" = "24") {
  return time.date ? "All day" : clockFormatter(zone, format).format(new Date(time.dateTime!));
}
export function timedLayout(events: CalendarEvent[], date: string, zone: string) {
  const start = dayInstant(date, zone), end = dayInstant(addCalendarDays(date, 1), zone);
  const items = events.filter(e => !e.start.date && eventOverlaps(e, start, end, zone)).map(event => {
    const minutes = (time: CalendarEventTime) => { const z = Temporal.Instant.from(time.dateTime!).toZonedDateTimeISO(zone); return z.hour * 60 + z.minute };
    return { event, top: Date.parse(event.start.dateTime!) < Date.parse(start) ? 0 : minutes(event.start), bottom: Date.parse(event.end.dateTime!) >= Date.parse(end) ? 1440 : minutes(event.end), column: 0, columns: 1 };
  }).sort((a, b) => a.top - b.top || b.bottom - a.bottom || a.event.eventId.localeCompare(b.event.eventId));
  let group: typeof items = [], groupEnd = -1;
  const finish = () => { const columns = Math.max(1, ...group.map(e => e.column + 1)); group.forEach(e => { e.columns = columns }); group = [] };
  for (const item of items) {
    item.bottom = Math.max(item.top + 15, item.bottom);
    if (item.top >= groupEnd) { finish(); groupEnd = -1 }
    const occupied = new Set(group.filter(e => e.bottom > item.top).map(e => e.column));
    while (occupied.has(item.column)) item.column++;
    group.push(item); groupEnd = Math.max(groupEnd, item.bottom);
  }
  finish(); return items;
}
