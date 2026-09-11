import { useQueries } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarConnection, type CalendarRecord } from "@zilobase/features/calendar";
import { apiFetch } from "@/platform/network/api";
export function useCalendarCatalog(connections: CalendarConnection[]) {
  const queries = useQueries({ queries: connections.map(connection => ({
    queryKey: calendarKeys.calendars(connection),
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<{ calendars: CalendarRecord[] }>(`${calendarApiBasePath(connection.workspaceId)}/connections/${encodeURIComponent(connection.bindingId)}/calendars`, { signal }),
    staleTime: 60_000, retry: false,
  })) });
  return { queries, calendars: queries.flatMap(query => query.data?.calendars ?? []), ready: queries.every(query => query.isSuccess) };
}
