import type { CalendarRecord, CalendarPreferences } from "@zilobase/features/calendar";
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon, CalendarIcon, CheckIcon } from "@/shared/components/icons";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import { SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME, SidebarNavItemAction } from "@/shared/ui/sidebar-nav-item-action";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import { calendarSelectionKey } from "./calendar-selection";
export { calendarSelectionKey } from "./calendar-selection";
export function CalendarList({ calendars, preferences, onPreferences, disabled }: { calendars: CalendarRecord[]; preferences: CalendarPreferences; onPreferences: (preferences: CalendarPreferences) => void; disabled: boolean }) {
  return <SidebarMenu>{calendars.map(calendar => {
    const key = calendarSelectionKey(calendar.bindingId, calendar.id), hidden = preferences.hiddenCalendarKeys.includes(key);
    const toggle = () => onPreferences({ ...preferences, hiddenCalendarKeys: hidden ? preferences.hiddenCalendarKeys.filter(id => id !== key) : [...preferences.hiddenCalendarKeys, key] });
    return <SidebarMenuItem key={key}><div className="group/nav-row relative">
      <SidebarMenuButton disabled={disabled} onClick={toggle} aria-pressed={!hidden} title={calendar.name} className={`${SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME} pr-16`}><CalendarIcon className="text-palette-blue" /><span className="min-w-0 flex-1 truncate">{calendar.name}</span>{preferences.defaultCalendarKey === key && <span className="text-xs text-content-secondary">Default</span>}</SidebarMenuButton>
      <DropdownMenu><DropdownMenuTrigger asChild><SidebarNavItemAction variant="menu" style={{ right: 30 }} aria-label={`Options for ${calendar.name}`}><MoreHorizontalIcon /></SidebarNavItemAction></DropdownMenuTrigger><DropdownMenuContent side="right" align="start"><DropdownMenuItem disabled={disabled || !calendar.permissions.write || preferences.defaultCalendarKey === key} onSelect={() => onPreferences({ ...preferences, defaultCalendarKey: key })}><CheckIcon />Make default calendar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <SidebarNavItemAction variant="menu" disabled={disabled} className={hidden ? "opacity-100" : ""} aria-label={`${hidden ? "Show" : "Hide"} ${calendar.name}`} onClick={toggle}>{hidden ? <EyeOffIcon /> : <EyeIcon />}</SidebarNavItemAction>
    </div></SidebarMenuItem>;
  })}</SidebarMenu>;
}
