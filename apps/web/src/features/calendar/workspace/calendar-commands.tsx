import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { calendarTravelPreferences, normalizeCalendarView, shiftCalendarPeriod, todayInZone, type CalendarPreferences, type CalendarView } from "@zilobase/features/calendar";
import { useAppShortcut } from "@/shared/shortcuts";
import { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem, CommandShortcut } from "@/shared/ui/command";
import { Button } from "@/shared/ui/button";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/platform/network/api";
import { useCalendarWorkspace, type CalendarCommand } from "./calendar-workspace";
export function CalendarCommands({ preferences, onPreferences, onSettings, onSearch }: { onSearch: () => void; preferences: CalendarPreferences; onPreferences?: (value: CalendarPreferences) => Promise<unknown>; onSettings: () => void }) {
  const workspace = useCalendarWorkspace(), navigate = useNavigate(), search = useSearch({ from: "/app/calendar" });
  const [mode, setMode] = useState<"commands" | "help" | null>(null), [pending, setPending] = useState(false);
  const view = normalizeCalendarView(search.view ?? preferences.view), date = search.date ?? todayInZone(workspace.travelZone ?? preferences.timeZone);
  const route = (search: import("./calendar-navigation").CalendarDestination) => workspace.navigateCalendar(search, () => { void navigate({ to: "/calendar", search }); });
  const period = (date: string, nextView: CalendarView = view, align = search.align) => route({ date, view: nextView, days: search.days, align });
  const save = async (value: CalendarPreferences) => { if (!onPreferences || pending) return; setPending(true); try { await onPreferences(value); } catch (error) { toast.error(getApiErrorMessage(error)); } finally { setPending(false); } };
  const commands: CalendarCommand[] = [
    { id: "today", label: "Go to today", shortcut: "T", run: () => period(todayInZone(workspace.travelZone ?? preferences.timeZone), view, preferences.todayAlignment === "start" || undefined) },
    { id: "previous", label: "Previous period", shortcut: "←", run: () => period(shiftCalendarPeriod(date, view, -1, search.days, preferences.showWeekends, search.align)) },
    { id: "next", label: "Next period", shortcut: "→", run: () => period(shiftCalendarPeriod(date, view, 1, search.days, preferences.showWeekends, search.align)) },
    ...workspace.featureCommands,
    ...(["day", "week", "month"] as const).map(next => ({ id: `view:${next}`, label: `Switch to ${next} view`, run: () => period(date, next) })),
    { id: "search", label: "Search calendar events", run: onSearch },
    { id: "panel", label: workspace.panelOpen ? "Close event panel" : "Open event panel", run: () => workspace.panelOpen ? workspace.closePanel() : workspace.openPanel() },
    { id: "settings", label: "Calendar settings", run: onSettings },
    ...([-1, 1] as const).map(direction => ({ id: `days:${direction}`, label: direction > 0 ? "Show more days" : "Show fewer days", disabled: view !== "week" || (search.days ?? 7) + direction < 1 || (search.days ?? 7) + direction > 31, run: () => route({ date, view, align: search.align, days: (search.days ?? 7) + direction }) })),
    ...([{ label: "Taller hours", height: Math.min(120, (preferences.hourHeight ?? 48) + 8) }, { label: "Denser hours", height: Math.max(32, (preferences.hourHeight ?? 48) - 8) }, { label: "Reset hour height", height: 48 }].map(({ label, height }) => ({ id: label, label, disabled: !onPreferences || pending, run: () => void save({ ...preferences, hourHeight: height }) }))),
    ...(["showWeekends", "showDeclined", "showWeekNumbers"] as const).map(key => ({ id: key, label: `${preferences[key] ? "Hide" : "Show"} ${key === "showWeekends" ? "weekends" : key === "showDeclined" ? "declined events" : "week numbers"}`, disabled: !onPreferences || pending, run: () => void save({ ...preferences, [key]: !preferences[key] }) })),
    ...(preferences.timeZoneColumns ?? [preferences.timeZone, ...preferences.secondaryTimeZones].map(zone => ({ zone, label: zone }))).map(column => ({ id: `zone:${column.zone}`, label: `Make ${column.label} the primary time zone`, disabled: !onPreferences || pending || preferences.timeZone === column.zone, run: () => void save(calendarTravelPreferences(preferences, column.zone)) })),
    { id: "travel", label: "Travel to a time zone", shortcut: "Z", run: () => workspace.setTravelPickerOpen(true) },
    { id: "restore-travel", label: "Restore saved time zone", disabled: !workspace.travelZone, run: () => workspace.setTravelZone(null) },
    { id: "help", label: "Calendar shortcut help", shortcut: "?", run: () => setMode("help") },
  ];
  const invoke = (id: string, event: KeyboardEvent) => invokeCalendarCommand(commands, id, event);
  useAppShortcut("openSearch", () => { setMode(current => current ? null : "commands"); return true; }, { allowInEditable: true, priority: 50 });
  useAppShortcut("calendarHelp", () => { setMode("help"); return true; }, { priority: 50 });
  useAppShortcut("calendarTravel", event => invoke("travel", event), { priority: 50 });
  useAppShortcut("calendarToday", event => invoke("today", event), { priority: 50 });
  useAppShortcut("calendarPrevious", event => invoke("previous", event), { priority: 50 });
  useAppShortcut("calendarNext", event => invoke("next", event), { priority: 50 });
  useAppShortcut("calendarCreate", event => invoke("create", event), { priority: 50 });
  useAppShortcut("calendarNextEvent", event => invoke("next-event", event), { priority: 50 });
  useAppShortcut("calendarPreviousEvent", event => invoke("previous-event", event), { priority: 50 });
  return <><Button variant="ghost" aria-label="Calendar commands" onClick={() => setMode("commands")}>Commands</Button><CommandDialog open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }} title={mode === "help" ? "Calendar shortcuts" : "Calendar commands"} description="Search Calendar actions. Letter shortcuts are ignored while typing."><Command><CommandInput placeholder={mode === "help" ? "Search shortcuts and actions…" : "Search Calendar commands…"} /><CommandList><CommandEmpty>No matching actions.</CommandEmpty>{commands.map(command => <CommandItem key={command.id} value={`${command.label} ${command.shortcut ?? ""}`} disabled={command.disabled} onSelect={() => { if (command.disabled) return; setMode(null); command.run(); }}>{command.label}{command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}</CommandItem>)}</CommandList></Command></CommandDialog></>;
}
function invokeCalendarCommand(commands: CalendarCommand[], id: string, event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('[role="dialog"],[role="alertdialog"],[role="menu"]')) return false;
  const command = commands.find(command => command.id === id);
  if (!command || command.disabled) return false;
  command.run(); return true;
}
