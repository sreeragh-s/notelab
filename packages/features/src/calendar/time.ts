// Compatibility facade for existing provider-calendar consumers.
export { calendarDate, dayInstant, addCalendarDays, todayInZone, wallTime, eventInstant, eventOverlaps, calendarDays, shiftCalendarPeriod, eventClock } from "../calendar-layout/time";
import { timedLayout as layout } from "../calendar-layout/time";
import type { CalendarEvent } from "./contracts";
export function timedLayout(events: CalendarEvent[], date: string, zone: string) {
  return layout(events, date, zone, event => event.eventId);
}
