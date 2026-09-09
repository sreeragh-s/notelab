import { useNavigate, useSearch } from "@tanstack/react-router";
import { todayInZone, shiftCalendarPeriod, type CalendarPreferences, type CalendarView } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import { SearchIcon, SidebarSimpleIcon, ChevronLeftIcon, ChevronRightIcon, SettingsIcon, MoreHorizontalIcon } from "@/shared/components/icons";
import { useCalendarWorkspace } from "./calendar-workspace";
export function CalendarToolbar({ preferences, onSettings }: { preferences: CalendarPreferences; onSettings: () => void }) {
  const workspace = useCalendarWorkspace(), search = useSearch({ from: "/app/calendar" }), navigate = useNavigate();
  const date = search.date ?? todayInZone(preferences.timeZone), view = search.view ?? preferences.view;
  const period = (date: string, view: CalendarView) => void navigate({ to: "/calendar", search: { date, view } });
  const today = () => period(todayInZone(preferences.timeZone), view);
  const shift = (direction: number) => period(shiftCalendarPeriod(date, view, direction), view);
  const input = <Input aria-label="Search calendar" placeholder="Search events" value={workspace.query} onChange={event => workspace.setQuery(event.target.value)} />;
  return <div className="flex min-w-0 items-center gap-1" aria-label="Calendar controls">
    <div className="hidden w-44 lg:block">{input}</div>
    <Popover><PopoverTrigger asChild><Button className="lg:hidden" variant="ghost" size="icon" aria-label="Search events"><SearchIcon /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 p-2">{input}</PopoverContent></Popover>
    <Select value={view} onValueChange={next => period(date, next as CalendarView)}><SelectTrigger aria-label="Calendar view" className="w-24"><SelectValue /></SelectTrigger><SelectContent>{(["day", "week", "month", "agenda"] as const).map(value => <SelectItem key={value} value={value}>{value[0]!.toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select>
    <Button variant="ghost" size="icon" data-calendar-panel-toggle aria-label="Calendar event panel" aria-expanded={workspace.panelOpen} onClick={() => workspace.panelOpen ? workspace.closePanel() : workspace.openPanel()}><SidebarSimpleIcon /></Button>
    <div className="hidden items-center gap-1 lg:flex"><Button variant="ghost" onClick={today}>Today</Button><Button variant="ghost" size="icon" aria-label="Previous period" onClick={() => shift(-1)}><ChevronLeftIcon /></Button><Button variant="ghost" size="icon" aria-label="Next period" onClick={() => shift(1)}><ChevronRightIcon /></Button></div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button className="lg:hidden" variant="ghost" size="icon" aria-label="Calendar navigation"><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={today}>Today</DropdownMenuItem><DropdownMenuItem onSelect={() => shift(-1)}><ChevronLeftIcon />Previous period</DropdownMenuItem><DropdownMenuItem onSelect={() => shift(1)}><ChevronRightIcon />Next period</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Button variant="ghost" size="icon" aria-label="Calendar settings" onClick={onSettings}><SettingsIcon /></Button>
  </div>;
}
