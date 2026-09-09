import { useQuery } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarConnection, type CalendarRecord, type CalendarPreferences } from "@zilobase/features/calendar";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { Checkbox } from "@/shared/ui/checkbox";
import { Button } from "@/shared/ui/button";
export const calendarSelectionKey = (bindingId: string, calendarId: string) => JSON.stringify([bindingId, calendarId]);
export function CalendarList({ connection, preferences, onPreferences, disabled }: { connection: CalendarConnection; preferences: CalendarPreferences; onPreferences: (preferences: CalendarPreferences) => void; disabled: boolean }) {
  const calendars = useQuery({ queryKey: calendarKeys.calendars(connection), queryFn: () => apiFetch<{ calendars: CalendarRecord[] }>(`${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(connection.bindingId)}/calendars`), staleTime: 60_000, retry: false });
  if (calendars.error) return <p role="alert" className="text-xs text-content-secondary">{getApiErrorMessage(calendars.error)}</p>;
  if (calendars.isPending) return <p className="text-xs text-content-secondary">Loading calendars…</p>;
  return <div className="grid gap-2">{calendars.data.calendars.map(calendar => {
    const key = calendarSelectionKey(connection.bindingId, calendar.id);
    return <div key={key} className="flex items-center gap-2 text-xs"><Checkbox id={key} disabled={disabled} checked={!preferences.hiddenCalendarKeys.includes(key)} onCheckedChange={checked => onPreferences({ ...preferences, hiddenCalendarKeys: checked ? preferences.hiddenCalendarKeys.filter(id => id !== key) : [...preferences.hiddenCalendarKeys, key] })} /><label className="min-w-0 flex-1 truncate" htmlFor={key}>{calendar.name}</label>{calendar.permissions.write && <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Make ${calendar.name} default`} onClick={() => onPreferences({ ...preferences, defaultCalendarKey: key })}>{preferences.defaultCalendarKey === key ? "Default" : "Set default"}</Button>}</div>;
  })}</div>;
}
