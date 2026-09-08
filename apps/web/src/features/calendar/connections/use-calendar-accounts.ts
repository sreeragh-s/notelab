import { useSession } from "@zilobase/features/auth/react";
import { calendarDatabaseName, destroyCalendarDatabase } from "../storage/calendar-database";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarApiBasePath, calendarKeys, type CalendarConnection } from "@zilobase/features/calendar";
import { apiFetch, toApiUrl, getApiErrorMessage } from "@/platform/network/api";
import { isDesktopApp } from "@/platform/environment";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
export function useCalendarAccounts(workspaceId: string) {
  const { data: session } = useSession();
  const client = useQueryClient(), base = calendarApiBasePath(workspaceId);
  const accounts = useQuery({ queryKey: calendarKeys.connections(workspaceId), queryFn: () => apiFetch<{ connections: CalendarConnection[]; providerConfigured: boolean }>(`${base}/connections`), staleTime: 30_000, retry: false });
  const connect = useMutation({ mutationFn: async () => {
    const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(`${base}/connections/google/start`, { method: "POST", body: JSON.stringify({ client: isDesktopApp() ? "desktop" : "web" }) });
    if (isDesktopApp()) await invoke("open_mail_authorization_url", { authorizationUrl });
    else window.location.assign(authorizationUrl);
  }, onError: error => toast.error(getApiErrorMessage(error)) });
  const disconnect = useMutation({ mutationFn: (bindingId: string) => apiFetch(`${base}/connections/${encodeURIComponent(bindingId)}`, { method: "DELETE" }), onSuccess: async (_result, bindingId) => { if (session?.user?.id) await destroyCalendarDatabase(calendarDatabaseName({ apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin, userId: session.user.id, workspaceId, bindingId })); await client.invalidateQueries({ queryKey: calendarKeys.connections(workspaceId) }) }, onError: error => toast.error(getApiErrorMessage(error)) });
  return { accounts, connect, disconnect };
}
