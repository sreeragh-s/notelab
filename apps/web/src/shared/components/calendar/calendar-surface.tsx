import { CalendarDragContext } from "./drag-context";
import { useId, useCallback, useEffect, useMemo, useState } from "react";
import { addCalendarDays, calendarDays, dayInstant, eventClock, createEventIndex, shiftCalendarPeriod } from "@zilobase/features/calendar-layout";
import { Button } from "@/shared/ui/button";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarPeriodScroller } from "./calendar-period-scroller";
import { type CalendarItem, type CalendarSurfaceProps } from "./types";

export function CalendarSurface({ zoneControls, items, date, view, preferences, onNavigate, onRangeChange, onSelect, onCreate, onChange, onError, renderItem }: CalendarSurfaceProps) {
  const scope = useId();
  const dragContext = useMemo(() => ({ scope, items: new Map(items.map(item => [item.id, item])) }), [scope, items]);
  const allDays = useMemo(() => calendarDays(date, view, preferences.weekStartsOn, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart), [date, view, preferences.weekStartsOn, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart]);
  const periods = useMemo(() => [-1, 0, 1].map(direction => calendarDays(shiftCalendarPeriod(date, view, direction, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart), view, preferences.weekStartsOn, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart).filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()))), [date, view, preferences.weekStartsOn, preferences.showWeekends, preferences.visibleDayCount, preferences.alignStart]);
  const [monthDays, setMonthDays] = useState<string[]>([]);
  const loadedDays = useMemo(() => view === "day" || view === "week" ? periods.flat() : view === "month" && monthDays.length ? monthDays : allDays, [allDays, view, periods, monthDays]);
  const start = dayInstant(loadedDays[0]!, preferences.timeZone), end = dayInstant(addCalendarDays(loadedDays.at(-1)!, 1), preferences.timeZone);
  useEffect(() => onRangeChange?.({ start, end }), [start, end, onRangeChange]);
  const days = useMemo(() => allDays.filter(day => preferences.showWeekends || view === "day" || ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())), [allDays, preferences.showWeekends, view]);
  const [indexEvents] = useState(() => createEventIndex<CalendarItem>());
  const eventsByDay = useMemo(() => indexEvents(items, loadedDays, preferences.timeZone), [indexEvents, items, loadedDays, preferences.timeZone]);
  const writable = useCallback((item: CalendarItem) => Boolean(item.editable && onChange), [onChange]);
  const change = useCallback((item: CalendarItem) => { if (item.editable) onChange?.(item); }, [onChange]);
  const day = useCallback((next: string) => onNavigate(next, "day"), [onNavigate]);
  const navigateDate = useCallback((next: string) => onNavigate(next, view), [onNavigate, view]);
  const navigatePeriod = useCallback((direction: number) => onNavigate(shiftCalendarPeriod(date, view, direction, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart), view), [onNavigate, date, view, preferences.visibleDayCount, preferences.showWeekends, preferences.alignStart]);
  const create = useCallback((day: string, hour: number, duration: number) => onCreate?.(day, hour, duration), [onCreate]);
  const card = useCallback((event: CalendarItem) => {
    const timed = !event.start.date && (view === "day" || view === "week");
    return <Button key={event.id} data-calendar-event-card draggable={view === "month" && writable(event) && !event.start.date} onDragStart={e => e.dataTransfer.setData("text/calendar-event", JSON.stringify([scope, event.id]))} variant="ghost" className={`${timed ? "h-full flex-col items-start gap-0.5 rounded-md border border-current p-2" : event.start.date && (view === "day" || view === "week") ? "h-auto rounded-none px-1.5 py-1" : "h-auto rounded-sm px-1.5 py-1"} ${timed && event.dashed ? "border-dashed" : ""} w-full justify-start overflow-hidden text-left text-xs font-normal ${event.backgroundClass ?? "bg-surface-canvas"} ${event.textClass ?? "text-content-primary"}`} onClick={() => onSelect?.(event)} title={event.title}>
      {renderItem ? renderItem(event) : <><span className="w-full truncate font-medium">{event.title}</span>{!event.start.date && <span className="truncate text-[11px] opacity-80">{eventClock(event.start, preferences.timeZone, preferences.timeFormat)}–{eventClock(event.end, preferences.timeZone, preferences.timeFormat)}</span>}</>}
    </Button>;
  }, [scope, view, writable, onSelect, renderItem, preferences.timeZone, preferences.timeFormat]);
  let content;
  if (view === "month") content = <CalendarMonthView date={date} onDate={navigateDate} onRangeChange={setMonthDays} days={days} eventsByDay={eventsByDay} preferences={preferences} online={Boolean(onChange)} writable={writable} card={card} onDay={day} onChange={change} onError={onError} />;
  else content = <CalendarPeriodScroller zoneControls={zoneControls} view={view} canCreate={Boolean(onCreate)} periods={periods} periodKey={`${view}:${date}:${preferences.visibleDayCount ?? 7}:${preferences.showWeekends}:${preferences.alignStart}`} onPeriod={navigatePeriod} eventsByDay={eventsByDay} preferences={preferences} card={card} writable={writable} onDay={day} onCreate={create} onChange={change} onError={onError} />;
  return <CalendarDragContext.Provider value={dragContext}>{content}</CalendarDragContext.Provider>;
}
