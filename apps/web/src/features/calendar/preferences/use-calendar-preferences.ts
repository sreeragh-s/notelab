import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarPreferences } from "@zilobase/features/calendar";
import { apiFetch, getApiErrorMessage } from "@/platform/network/api";
import { toast } from "sonner";
export function useCalendarPreferences(workspaceId: string) {
  const client = useQueryClient(), queryKey = calendarKeys.preferences(workspaceId), path = `${calendarApiBasePath(workspaceId)}/preferences`;
  const query = useQuery({ queryKey, queryFn: () => apiFetch<CalendarPreferences>(path), staleTime: 60_000 });
  const save = useMutation({ mutationFn: (data: CalendarPreferences) => apiFetch<CalendarPreferences>(path, { method: "PUT", body: JSON.stringify(data) }), onSuccess: data => client.setQueryData(queryKey, data), onError: error => toast.error(getApiErrorMessage(error)) });
  return { query, save };
}
