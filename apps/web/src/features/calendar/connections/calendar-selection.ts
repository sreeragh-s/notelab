import type { CalendarPreferences, CalendarRecord } from "@zilobase/features/calendar";
export const calendarSelectionKey = (bindingId: string, calendarId: string) => JSON.stringify([bindingId, calendarId]);
export function resolveDefaultCalendar(calendars: CalendarRecord[], preferences: CalendarPreferences) {
  const writable = calendars.filter(calendar => calendar.permissions.write && !preferences.removedCalendarKeys?.includes(calendarSelectionKey(calendar.bindingId, calendar.id)));
  const chosen = writable.find(calendar => calendarSelectionKey(calendar.bindingId, calendar.id) === preferences.defaultCalendarKey);
  if (chosen) return chosen;
  const firstBinding = writable[0]?.bindingId;
  return writable.find(calendar => calendar.bindingId === firstBinding && calendar.primary) ?? writable[0];
}

export function calendarIsVisible(preferences: CalendarPreferences, bindingId: string, calendarId: string) {
  const key = calendarSelectionKey(bindingId, calendarId);
  return !preferences.hiddenCalendarKeys.includes(key) && !preferences.removedCalendarKeys?.includes(key);
}
