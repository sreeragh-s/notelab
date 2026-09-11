import { useCalendarAccounts } from "../connections/use-calendar-accounts";
import { useCalendarCatalog } from "../connections/use-calendar-catalog";
import { calendarSelectionKey } from "../connections/calendar-selection";
import { useCalendarPreferences } from "./use-calendar-preferences";
import { Button } from "@/shared/ui/button";
export function RemovedCalendars({ workspaceId }: { workspaceId: string }) {
  const { accounts } = useCalendarAccounts(workspaceId), preferences = useCalendarPreferences(workspaceId);
  const catalog = useCalendarCatalog(accounts.data?.connections ?? []), value = preferences.query.data;
  const removed = catalog.calendars.filter(calendar => value?.removedCalendarKeys?.includes(calendarSelectionKey(calendar.bindingId, calendar.id)));
  if (!value || !removed.length) return null;
  return <section className="grid gap-2 border-t border-stroke-default pt-4"><h3 className="text-sm font-medium">Removed calendars</h3>{removed.map(calendar => {
    const key = calendarSelectionKey(calendar.bindingId, calendar.id);
    return <div key={key} className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm">{calendar.name}</p><p className="truncate text-xs text-content-secondary">{accounts.data?.connections.find(account => account.bindingId === calendar.bindingId)?.email}</p></div><Button size="sm" variant="ghost" disabled={preferences.pending} onClick={() => preferences.save.mutate({ ...value, removedCalendarKeys: value.removedCalendarKeys?.filter(id => id !== key), hiddenCalendarKeys: value.hiddenCalendarKeys.filter(id => id !== key) })}>Restore</Button></div>;
  })}</section>;
}
