import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useCalendarAccounts } from "./use-calendar-accounts";
import { useCalendarCatalog } from "./use-calendar-catalog";
import { calendarSelectionKey } from "./calendar-selection";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";
import { requestCalendarNotificationPermission } from "../reminders/notification-delivery";

export function CalendarConnectionStatus({ workspaceId }: { workspaceId: string }) {
  const search = useSearch({ from: "/app/calendar" }), navigate = useNavigate(), client = useQueryClient();
  const { accounts, connect } = useCalendarAccounts(workspaceId), preferences = useCalendarPreferences(workspaceId);
  const catalog = useCalendarCatalog(search.connection === "success" ? accounts.data?.connections ?? [] : []);
  useEffect(() => { if (search.connection) void client.invalidateQueries({ queryKey: ["calendar", "sources"] }); }, [search.connection, client]);
  if (!search.connection) return null;
  const value = preferences.query.data;
  return <section className="grid gap-3 border-b border-stroke-default p-4 text-sm" aria-label="Calendar connection result">
    <p role="status">{search.connection === "success" ? "Google Calendar connected. Choose your default calendar and reminder preferences." : "Connection cancelled. Your existing calendars are unchanged."}</p>
    <ConnectionResultActions connection={search.connection} value={value} catalog={catalog} preferences={preferences} connect={connect} />
    <Button variant="ghost" onClick={() => void navigate({ to: "/calendar", search: { ...search, connection: undefined, workspace: undefined }, replace: true })}>Done</Button>
  </section>;
}
function ConnectionResultActions({ connection, value, catalog, preferences, connect }: { connection: string; value: ReturnType<typeof useCalendarPreferences>["query"]["data"]; catalog: ReturnType<typeof useCalendarCatalog>; preferences: ReturnType<typeof useCalendarPreferences>; connect: ReturnType<typeof useCalendarAccounts>["connect"] }) {
  if (connection === "cancelled") return <Button disabled={connect.isPending} onClick={() => connect.mutate()}>Try again</Button>;
  return <>
    {value && <Label>Default calendar<Select value={value.defaultCalendarKey ?? ""} disabled={preferences.pending} onValueChange={key => preferences.save.mutate({ ...value, defaultCalendarKey: key })}><SelectTrigger><SelectValue placeholder="Choose a calendar" /></SelectTrigger><SelectContent>{catalog.calendars.filter(calendar => calendar.permissions.write).map(calendar => <SelectItem key={calendarSelectionKey(calendar.bindingId, calendar.id)} value={calendarSelectionKey(calendar.bindingId, calendar.id)}>{calendar.name}</SelectItem>)}</SelectContent></Select></Label>}
    {value && !value.remindersEnabled && <Button variant="outline" disabled={preferences.pending} onClick={() => { preferences.save.mutate({ ...value, remindersEnabled: true }); void requestCalendarNotificationPermission().catch(() => {}); }}>Enable meeting reminders</Button>}
    <p className="text-xs text-content-secondary">You can change these choices in Calendar settings. System notifications are optional.</p>
  </>;
}
